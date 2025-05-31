from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from celery import Celery
import boto3
import whisper
from moviepy.editor import VideoFileClip, TextClip, CompositeVideoClip
import os
from typing import Dict

app = FastAPI()
celery = Celery('tasks', broker='redis://localhost:6379/0')

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

s3 = boto3.client('s3')
model = whisper.load_model("large")

@celery.task
def process_video(video_path: str, output_path: str) -> Dict:
    try:
        # Download video from S3
        s3.download_file(os.getenv('AWS_S3_BUCKET'), video_path, 'temp_video.mp4')

        # Transcribe with Whisper
        result = model.transcribe('temp_video.mp4', language='ja')
        
        # Load video
        video = VideoFileClip('temp_video.mp4')
        
        # Create subtitles
        subtitles = []
        for segment in result['segments']:
            start = segment['start']
            end = segment['end']
            text = segment['text']
            
            txt_clip = (TextClip(text, font='Arial', fontsize=24, color='white')
                       .set_position(('center', 'bottom'))
                       .set_duration(end - start)
                       .set_start(start))
            subtitles.append(txt_clip)
        
        # Combine video with subtitles
        final = CompositeVideoClip([video] + subtitles)
        final.write_videofile('temp_output.mp4')
        
        # Upload to S3
        s3.upload_file('temp_output.mp4', os.getenv('AWS_S3_BUCKET'), output_path)
        
        # Clean up
        os.remove('temp_video.mp4')
        os.remove('temp_output.mp4')
        
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/process-video")
async def start_processing(filename: str):
    task = process_video.delay(
        f"uploads/{filename}",
        f"processed/{filename}"
    )
    return {"taskId": task.id}

@app.get("/api/status/{task_id}")
async def get_status(task_id: str):
    task = process_video.AsyncResult(task_id)
    if task.ready():
        if task.successful():
            download_url = s3.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': os.getenv('AWS_S3_BUCKET'),
                    'Key': f"processed/{task_id}.mp4"
                },
                ExpiresIn=3600
            )
            return {"status": "completed", "downloadUrl": download_url}
        else:
            return {"status": "failed"}
    return {"status": "processing"}