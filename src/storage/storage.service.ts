import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService {
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const accountId = this.config.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');
    this.bucket = this.config.get<string>('R2_BUCKET') ?? 'sksks-exports';

    if (!accountId || !accessKeyId || !secretAccessKey) {
      console.warn(
        '⚠️ Kredensial Cloudflare R2 tidak lengkap. Ekspor akan gagal jika digunakan.',
      );
    }

    const customEndpoint = this.config.get<string>('R2_ENDPOINT');
    const endpoint =
      customEndpoint ??
      (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

    this.s3Client = new S3Client({
      region: 'auto',
      ...(endpoint ? { endpoint } : {}),
      forcePathStyle: !!customEndpoint,
      credentials: {
        accessKeyId: accessKeyId ?? '',
        secretAccessKey: secretAccessKey ?? '',
      },
    });
  }

  /**
   * Mengunggah konten string (misal: CSV) ke R2 dan mengembalikan URL unduh sementara.
   * @param key Kunci (nama berkas) di bucket.
   * @param content Konten teks yang akan diunggah.
   * @param contentType MIME type konten.
   * @param expiresIn Durasi berlaku URL dalam detik (default: 1 jam).
   */
  async uploadAndGetDownloadUrl(
    key: string,
    content: string,
    contentType: string = 'text/csv',
    expiresIn: number = 3600,
  ): Promise<string> {
    try {
      // 1. Unggah berkas ke R2
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: content,
          ContentType: contentType,
        }),
      );

      // 2. Buat presigned URL untuk klien mengunduhnya
      const url = await getSignedUrl(
        this.s3Client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
        { expiresIn },
      );

      return url;
    } catch (err) {
      console.error('Gagal mengunggah ke R2:', err);
      throw new InternalServerErrorException(
        'Gagal menghasilkan ekspor. Periksa konfigurasi R2.',
      );
    }
  }

  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    try {
      const url = await getSignedUrl(
        this.s3Client,
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ContentType: contentType,
        }),
        { expiresIn },
      );
      return url;
    } catch (err) {
      console.error('Gagal menghasilkan presigned upload URL:', err);
      throw new InternalServerErrorException('Gagal menghasilkan URL unggah');
    }
  }

  async getPresignedDownloadUrl(
    key: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    try {
      const url = await getSignedUrl(
        this.s3Client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
        { expiresIn },
      );
      return url;
    } catch (err) {
      console.error('Gagal menghasilkan presigned download URL:', err);
      throw new InternalServerErrorException('Gagal menghasilkan URL unduh');
    }
  }
}
