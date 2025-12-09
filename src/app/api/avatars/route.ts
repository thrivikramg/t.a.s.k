import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
    try {
        const publicDir = path.join(process.cwd(), 'public');
        const files = fs.readdirSync(publicDir);

        const glbFiles = files.filter(file => file.endsWith('.glb'));

        return NextResponse.json({ avatars: glbFiles });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to list avatars' }, { status: 500 });
    }
}
