import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
    try {
        // Hardcoded list as primary source to ensure they are always displayed
        const avatars = [
            'avatar1.glb',
            'avatar2.glb',
            'avatar3.glb',
            'avatar4.glb'
        ];

        return NextResponse.json({ avatars });
    } catch (error) {
        console.error('Error listing avatars:', error);
        return NextResponse.json({ error: 'Failed to list avatars' }, { status: 500 });
    }
}
