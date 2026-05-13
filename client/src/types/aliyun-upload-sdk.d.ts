interface AliyunUploadConfig {
  userId: string;
  region: string;
  partSize?: number;
  parallel?: number;
  retryCount?: number;
  retryDuration?: number;
  refreshSTSToken?: () => Promise<{
    accessKeyId: string;
    accessKeySecret: string;
    stsToken: string;
    expiration: string;
  }>;
  refreshSTSTokenInterval?: number;
  onUploadstarted?: (uploadInfo: any) => void;
  onUploadSucceed?: (uploadInfo: any) => void;
  onUploadFailed?: (uploadInfo: any, code: string, message: string) => void;
  onUploadProgress?: (uploadInfo: any, totalSize: number, loadedPercent: number) => void;
  onUploadTokenExpired?: () => void;
  onUploadCanceled?: () => void;
}

interface AliyunUploader {
  addFile(file: File, userData?: any, endpoint?: any, bucketName?: any, uploadAddress?: string, uploadAuth?: string): void;
  startUpload(): void;
  stopUpload(): void;
  pauseUpload(): void;
  resumeUpload(): void;
  setUploadAuthAndAddress(uploadInfo: any, uploadAuth: string, uploadAddress: string): void;
  setSTSToken(uploadInfo: any, accessKeyId: string, accessKeySecret: string, securityToken: string): void;
  resumeUploadWithSTSToken(accessKeyId: string, accessKeySecret: string, securityToken: string, expireTime: string): void;
}

interface AliyunUploadVod {
  new (config: AliyunUploadConfig): AliyunUploader;
}

interface Window {
  AliyunUpload?: {
    Vod: AliyunUploadVod;
  };
}
