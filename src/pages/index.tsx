import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Progress } from '@mantine/core';
import axios from 'axios';

export default function Home() {
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');

  const { getRootProps, getInputProps } = useDropzone({
    accept: {
      'video/*': ['.mp4', '.mov', '.avi']
    },
    maxFiles: 1,
    onDrop: async (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (!file) return;

      try {
        // Get presigned URL from your backend
        const presignedUrlResponse = await axios.get('/api/get-upload-url');
        const { url, fields } = presignedUrlResponse.data;

        // Create form data for S3 upload
        const formData = new FormData();
        Object.entries(fields).forEach(([key, value]) => {
          formData.append(key, value as string);
        });
        formData.append('file', file);

        // Upload to S3
        await axios.post(url, formData, {
          onUploadProgress: (progressEvent) => {
            const progress = Math.round(
              (progressEvent.loaded * 100) / (progressEvent.total ?? 100)
            );
            setUploadProgress(progress);
          },
        });

        // Start processing
        setProcessingStatus('Transcribing with Whisper...');
        const processResponse = await axios.post('/api/process-video', {
          filename: file.name,
        });

        const { taskId } = processResponse.data;

        // Poll for status
        const pollStatus = async () => {
          const statusResponse = await axios.get(`/api/status/${taskId}`);
          const { status, downloadUrl } = statusResponse.data;

          if (status === 'completed') {
            setProcessingStatus('Complete!');
            setDownloadUrl(downloadUrl);
          } else if (status === 'failed') {
            setProcessingStatus('Processing failed');
          } else {
            setProcessingStatus(status);
            setTimeout(pollStatus, 2000);
          }
        };

        pollStatus();
      } catch (error) {
        console.error('Error processing video:', error);
        setProcessingStatus('Error processing video');
      }
    }
  });

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white shadow sm:rounded-lg p-6">
          <h1 className="text-2xl font-bold mb-8">Video Processor</h1>
          
          <div {...getRootProps()} className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center cursor-pointer hover:border-gray-400 transition-colors">
            <input {...getInputProps()} />
            <p>ドラッグ＆ドロップ、またはクリックして動画をアップロード</p>
          </div>

          {uploadProgress > 0 && (
            <div className="mt-6">
              <p className="mb-2">アップロード進捗:</p>
              <Progress value={uploadProgress} className="w-full" />
            </div>
          )}

          {processingStatus && (
            <div className="mt-6">
              <p className="font-medium">ステータス: {processingStatus}</p>
            </div>
          )}

          {downloadUrl && (
            <div className="mt-6">
              <a
                href={downloadUrl}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                download
              >
                字幕付き動画をダウンロード
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}