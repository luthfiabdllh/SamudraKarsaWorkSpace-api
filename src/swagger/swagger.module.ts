import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import * as path from 'path';
import * as swaggerUi from 'swagger-ui-express';
import * as yamljs from 'yamljs';

@Module({})
export class SwaggerModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    const yamlPath = path.resolve(process.cwd(), 'docs/openapi.yaml');
    
    // Gunakan try-catch agar jika yaml belum dibuat, tidak memblokir aplikasi
    let swaggerDocument;
    try {
      swaggerDocument = yamljs.load(yamlPath);
    } catch (e) {
      console.warn('⚠️ docs/openapi.yaml tidak ditemukan. Swagger UI mungkin kosong.');
      swaggerDocument = {};
    }

    // Pasang middleware swagger-ui di '/api/v1/docs'
    // Kami menggunakan wildcards karena swagger-ui-express melayani aset statis
    consumer
      .apply(...swaggerUi.serve, swaggerUi.setup(swaggerDocument))
      .forRoutes('v1/docs'); // NestJS versioning URI secara otomatis dipetakan ke /api/v1/docs
  }
}

