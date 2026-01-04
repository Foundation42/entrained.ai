/**
 * Forge Job Tracking
 *
 * Durable Object for tracking async generation jobs.
 */

import { DurableObject } from 'cloudflare:workers';

interface Job {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  description: string;
  created_at: string;
  updated_at: string;
  component_id?: string;
  error?: string;
}

export class ForgeJob extends DurableObject {
  private jobs: Map<string, Job> = new Map();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // POST /create - Create a new job
    if (path === '/create' && request.method === 'POST') {
      const { id, description } = await request.json() as {
        id: string;
        description: string;
      };

      const job: Job = {
        id,
        status: 'pending',
        description,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      this.jobs.set(id, job);
      return Response.json(job);
    }

    // POST /update - Update job status
    if (path === '/update' && request.method === 'POST') {
      const update = await request.json() as Partial<Job> & { id: string };
      const job = this.jobs.get(update.id);

      if (!job) {
        return Response.json({ error: 'Job not found' }, { status: 404 });
      }

      Object.assign(job, update, { updated_at: new Date().toISOString() });
      this.jobs.set(update.id, job);
      return Response.json(job);
    }

    // GET /status/:id - Get job status
    if (path.startsWith('/status/') && request.method === 'GET') {
      const id = path.split('/')[2];
      const job = this.jobs.get(id);

      if (!job) {
        return Response.json({ error: 'Job not found' }, { status: 404 });
      }

      return Response.json(job);
    }

    // GET /list - List recent jobs
    if (path === '/list' && request.method === 'GET') {
      const jobs = Array.from(this.jobs.values())
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 50);

      return Response.json({ jobs });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  }
}
