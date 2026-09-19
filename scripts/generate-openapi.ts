import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { extendZodWithOpenApi, OpenApiGeneratorV31, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';

extendZodWithOpenApi(z);

async function bootstrap() {
  const logger = new Logger('OpenAPI Generator');
  const app = await NestFactory.create(AppModule, { logger: false });
  
  const registry = new OpenAPIRegistry();
  
  // TODO: Secara dinamis memindai rute NestJS menggunakan DiscoveryService,
  // mengekstrak ZOD_SCHEMA_KEY dari metadata, dan mendaftarkannya ke registry.
  // Contoh pendaftaran manual:
  // registry.registerPath({ ... })

  const generator = new OpenApiGeneratorV31(registry.definitions);
  const document = generator.generateDocument({
    openapi: '3.1.0',
    info: {
      version: '1.0.0',
      title: 'Samudra Karsa API',
      description: 'Dokumentasi otomatis API via skrip',
    },
    servers: [{ url: '/api/v1' }],
  });

  const yamljs = require('yamljs');
  const yamlContent = yamljs.stringify(document, 10, 2);
  
  const outputPath = path.join(process.cwd(), 'docs', 'openapi.generated.yaml');
  fs.writeFileSync(outputPath, yamlContent, 'utf-8');
  
  logger.log(`✅ OpenAPI schema successfully generated at ${outputPath}`);
  
  await app.close();
}

bootstrap().catch((err) => {
  console.error('❌ Gagal menghasilkan OpenAPI:', err);
  process.exit(1);
});
