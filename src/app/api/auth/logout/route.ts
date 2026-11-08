import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantFromRequest } from '@/utils/tenantAuth';
import { TokenRevocationService } from '@/server/security/tokenRevocation';

export async function POST(req: NextRequest) {
  try {
    const authStaff = resolveTenantFromRequest(req);

    // Varsa oturum token'ını kara listeye al
    if (authStaff && (authStaff as any).token) {
      await TokenRevocationService.revoke((authStaff as any).token);
    }

    const response = NextResponse.json({
      success: true,
      message: 'Oturum başarıyla sonlandırıldı ve token iptal edildi.',
    });

    // Oturum çerezlerini temizle
    response.cookies.set('masalink_session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    });

    response.cookies.set('masalink_staff_session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    });

    return response;
  } catch (error: any) {
    console.error('[Logout API Error]:', error);
    return NextResponse.json(
      { success: false, error: 'Çıkış işlemi sırasında bir hata oluştu.' },
      { status: 500 }
    );
  }
}
