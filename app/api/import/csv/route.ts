import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/rbac'
import { parseCSV } from '@/lib/import'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['OWNER'])
    
    const { content } = await req.json()
    
    if (!content) {
      return NextResponse.json(
        { error: 'No content provided' },
        { status: 400 }
      )
    }

    const { data, errors } = parseCSV(content)

    return NextResponse.json({
      success: true,
      rowCount: data.length,
      errors,
      preview: data.slice(0, 5),
    })
  } catch (error) {
    console.error('Import error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Import failed' },
      { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 
                error instanceof Error && error.message === 'Forbidden' ? 403 : 500 }
    )
  }
}
