import { NextRequest } from 'next/server'

/**
 * Create a mock NextRequest for testing API routes
 */
export function createMockRequest(options: {
  method: string
  body?: any
  headers?: Record<string, string>
  url?: string
}): NextRequest {
  const { method, body, headers = {}, url = 'http://localhost:3000/api/test' } = options

  const request = new NextRequest(url, {
    method,
    headers: new Headers({
      'Content-Type': 'application/json',
      ...headers,
    }),
    body: body ? JSON.stringify(body) : undefined,
  })

  return request
}

/**
 * Extract JSON response from NextResponse
 */
export async function getResponseJson(response: Response) {
  return await response.json()
}
