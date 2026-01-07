import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';
import { v4 as uuidv4 } from 'uuid';

// Middleware to authenticate JWT token
async function authenticate(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as jwt.JwtPayload;
    return decoded;
  } catch {
    return null;
  }
}

// GET /api/visits - Get visit requests
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const user = await authenticate(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const hostelName = searchParams.get('hostelName');

    const whereClause: {
      parentId?: string;
      student?: { hostelName: string };
      status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'INSIDE' | 'OUT' | { in: Array<'PENDING' | 'APPROVED' | 'REJECTED' | 'INSIDE' | 'OUT'> };
    } = {};

    // Filter based on user role
    if (user.role === 'PARENT') {
      whereClause.parentId = user.id;
    } else if (user.role === 'WARDEN') {
      // Wardens should only see visits that have been scanned by security (INSIDE status)
      whereClause.status = {
        in: ['INSIDE', 'APPROVED', 'OUT']
      };
    }

    // Add status filter if provided
    if (status) {
      whereClause.status = status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'INSIDE' | 'OUT';
    }


    const visitRequests = await prisma.visitRequest.findMany({
      where: whereClause,
      include: {
        student: true,
        parent: {
          select: { name: true, email: true }
        },
        approvals: {
          include: {
            warden: {
              select: { name: true, email: true }
            }
          }
        },
        scanLogs: {
          include: {
            scanner: {
              select: { name: true, role: true }
            }
          },
          orderBy: { timestamp: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ visitRequests });
  } catch (error) {
    console.error('Get visit requests error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/visits - Create visit request
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const user = await authenticate(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user is PARENT
    if (user.role !== 'PARENT') {
      return NextResponse.json(
        { error: 'Only parents can create visit requests' },
        { status: 403 }
      );
    }

    const { 
      studentName, 
      rollNumber,
      hostelName, 
      roomNumber, 
      degree, 
      branch, 
      year, 
      vehicleNo, 
      purpose, 
      validFrom, 
      validUntil 

    } = await request.json();

    if (!studentName || !rollNumber || !hostelName || !validFrom || !validUntil) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Create or find student record
    let student = await prisma.student.findFirst({
      where: {
        OR: [
          { rollNumber: rollNumber },
          {
            AND: [
              { name: studentName },
              { hostelName: hostelName }
            ]
          }
        ]
      }
    });

    if (!student) {
      // Create new student record
      student = await prisma.student.create({
        data: {
          name: studentName,
          rollNumber: rollNumber,
          course: degree || 'Not specified',
          branch: branch || 'Not specified',
          year: year || 1,
          hostelName,
          roomNumber: roomNumber || undefined
        }
      });
    } else {
      // Update existing student record with new information if provided
      const updateData: Record<string, unknown> = {};
      if (rollNumber && student.rollNumber !== rollNumber) updateData.rollNumber = rollNumber;
      if (roomNumber && student.roomNumber !== roomNumber) updateData.roomNumber = roomNumber;
      if (degree && student.course !== degree) updateData.course = degree;
      if (branch && student.branch !== branch) updateData.branch = branch;
      if (year && student.year !== year) updateData.year = year;
      if (studentName && student.name !== studentName) updateData.name = studentName;
      if (hostelName && student.hostelName !== hostelName) updateData.hostelName = hostelName;

      if (Object.keys(updateData).length > 0) {
        student = await prisma.student.update({
          where: { id: student.id },
          data: updateData
        });
      }
    }

    // Generate unique QR code
    const qrCode = uuidv4();

    const visitRequest = await prisma.visitRequest.create({
      data: {
        parentId: user.id,
        studentId: student.id,
        vehicleNo,
        purpose,
        qrCode,
        validFrom: new Date(validFrom),
        validUntil: new Date(validUntil)
      },
      include: {
        student: true,
        parent: {
          select: { name: true, email: true }
        }
      }
    });

    return NextResponse.json({
      message: 'Visit request created successfully',
      visitRequest
    }, { status: 201 });

  } catch (error) {
    console.error('Create visit request error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
