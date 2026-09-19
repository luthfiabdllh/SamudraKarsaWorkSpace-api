import type { INestApplication, Type } from '@nestjs/common';
import { Controller, Get } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { Policy } from '../src/policy/policy.decorator';

/**
 * Environment diisi `test/setup-e2e.ts`, bukan di sini — lihat berkas itu
 * untuk alasannya.
 */

/** Rute uji yang dijaga — membuktikan `APP_GUARD` berlaku tanpa dipasang manual. */
@Controller('uji-tertutup')
class TertutupController {
  @Policy('work-item:read')
  @Get()
  rahasia(): { boleh: boolean } {
    return { boleh: true };
  }
}

/**
 * Rute uji yang **sengaja lupa dijaga**.
 *
 * Ini satu-satunya cara membuktikan `PolicyBootCheck` benar-benar bekerja.
 * Tanpa test ini, boot check bisa saja diam-diam tidak menemukan apa pun, dan
 * seluruh jaminan §7.1 hilang tanpa ada yang tahu.
 */
@Controller('uji-lupa')
class LupaController {
  @Get()
  lupa(): string {
    return 'seharusnya tidak pernah tersaji';
  }
}

async function boot(
  controllers: Type<unknown>[] = [],
): Promise<INestApplication<App>> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
    controllers,
  }).compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();

  return app;
}

describe('Kesehatan (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await boot();
  });

  afterAll(async () => {
    // Dijaga: kalau `beforeAll` gagal — mis. ada provider yang tidak bisa
    // diselesaikan — `app` tetap undefined, dan `app.close()` yang melempar di
    // sini akan menutupi error aslinya dengan error kedua yang membingungkan.
    if (app) {
      await app.close();
    }
  });

  it('liveness menjawab 200 tanpa menyentuh database', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(response.body).toMatchObject({ status: 'ok' });
  });

  it('readiness menjawab 503 saat database tidak terjangkau', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(503);

    // Bentuk RFC 7807 — bukan bentuk bawaan NestJS.
    expect(response.headers['content-type']).toContain(
      'application/problem+json',
    );

    // Pesan asli driver tidak boleh bocor: ia memuat host, pengguna, dan nama
    // database.
    expect(JSON.stringify(response.body)).not.toContain('127.0.0.1');
  });

  it('liveness tetap 200 meski readiness sedang 503', async () => {
    // Inilah alasan keduanya dipisah: database yang bermasalah tidak boleh
    // membuat platform mengira aplikasinya yang mati lalu me-restart-nya
    // berulang-ulang tanpa menolong siapa pun.
    await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
  });
});

describe('Policy guard (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await boot([TertutupController]);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('menolak rute yang dijaga tanpa token', async () => {
    // 401 — bukan karena rutenya dipasangi guard satu per satu, melainkan
    // karena APP_GUARD berlaku untuk seluruh aplikasi.
    await request(app.getHttpServer()).get('/api/v1/uji-tertutup').expect(401);
  });
});

describe('PolicyBootCheck (e2e)', () => {
  it('menolak menyalakan aplikasi kalau ada rute yang lupa dijaga', async () => {
    await expect(boot([LupaController])).rejects.toThrow(/uji-lupa/);
  });
});
