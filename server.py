import os
import json
import uuid
import string
import random
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

COUPONS_FILE = os.path.join(os.path.dirname(__file__), 'coupons.json')

# ── Gmail SMTP config ──────────────────────────────────────
SMTP_EMAIL = os.environ.get('UDREAM_EMAIL', 'udreamksa@gmail.com')
SMTP_PASSWORD = os.environ.get('UDREAM_APP_PASSWORD', '')  # Gmail App Password


def load_coupons():
    if os.path.exists(COUPONS_FILE):
        with open(COUPONS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}


def save_coupons(coupons):
    with open(COUPONS_FILE, 'w', encoding='utf-8') as f:
        json.dump(coupons, f, ensure_ascii=False, indent=2)


def generate_code():
    chars = string.ascii_uppercase + string.digits
    code = 'UDREAM-' + ''.join(random.choices(chars, k=6))
    return code


def build_email_html(code):
    return f"""<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Tahoma,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0d9669,#047857);padding:32px 24px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:28px;">🎉 مبروك! كوبون خصمك جاهز</h1>
    </div>

    <!-- Body -->
    <div style="padding:32px 24px;text-align:center;">
      <p style="color:#4b5563;font-size:16px;line-height:1.8;margin:0 0 24px;">
        شكراً لاشتراكك في Udream! 🎁<br>
        استخدم الكوبون التالي للحصول على <strong style="color:#0d9669;">خصم 5%</strong> على طلبك القادم:
      </p>

      <!-- Coupon Code Box -->
      <div style="background:#f0fdf4;border:2px dashed #0d9669;border-radius:12px;padding:20px;margin:0 auto 24px;max-width:300px;">
        <span style="font-size:28px;font-weight:700;color:#0d9669;letter-spacing:4px;direction:ltr;display:block;">
          {code}
        </span>
      </div>

      <p style="color:#6b7280;font-size:14px;margin:0 0 8px;">⚡ هذا الكوبون صالح لاستخدام واحد فقط</p>
      <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">📋 انسخ الكود وأدخله عند إتمام الطلب</p>

      <a href="http://localhost:8000" style="display:inline-block;background:linear-gradient(135deg,#0d9669,#047857);color:#fff;text-decoration:none;padding:14px 40px;border-radius:12px;font-size:16px;font-weight:600;">
        🛍️ تسوّق الآن
      </a>
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;padding:20px 24px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="color:#9ca3af;font-size:12px;margin:0;">
        © 2026 Udream. جميع الحقوق محفوظة.<br>
        وثيقة العمل الحر: FL-337742277
      </p>
    </div>
  </div>
</body>
</html>"""


def send_coupon_email(to_email, code):
    msg = MIMEMultipart('alternative')
    msg['Subject'] = '🎉 كوبون خصم 5% من Udream جاهز لك!'
    msg['From'] = f'Udream <{SMTP_EMAIL}>'
    msg['To'] = to_email

    html_body = build_email_html(code)
    msg.attach(MIMEText(html_body, 'html', 'utf-8'))

    with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
        server.login(SMTP_EMAIL, SMTP_PASSWORD)
        server.sendmail(SMTP_EMAIL, to_email, msg.as_string())


# ── API Routes ──────────────────────────────────────────────

@app.route('/api/coupon', methods=['POST'])
def create_coupon():
    data = request.get_json()
    email = (data or {}).get('email', '').strip().lower()

    if not email or '@' not in email:
        return jsonify({'success': False, 'error': 'بريد إلكتروني غير صالح'}), 400

    coupons = load_coupons()

    # Check if this email already got a coupon
    for code, info in coupons.items():
        if info.get('email') == email:
            return jsonify({
                'success': False,
                'error': 'لقد حصلت على كوبون مسبقاً! تحقق من بريدك الإلكتروني 📧'
            }), 409

    # Generate unique code
    code = generate_code()
    while code in coupons:
        code = generate_code()

    coupons[code] = {
        'email': email,
        'discount': 5,
        'used': False,
        'created': datetime.now().isoformat()
    }
    save_coupons(coupons)

    # Send email
    if SMTP_PASSWORD:
        try:
            send_coupon_email(email, code)
        except Exception as e:
            print(f'Email send error: {e}')
            return jsonify({
                'success': True,
                'code': code,
                'emailSent': False,
                'message': 'تم إنشاء الكوبون لكن فشل إرسال البريد. كوبونك هو: ' + code
            })
    else:
        print(f'[NO SMTP] Coupon {code} for {email} (email not configured)')

    return jsonify({
        'success': True,
        'emailSent': bool(SMTP_PASSWORD),
        'message': 'تم إرسال كوبون الخصم إلى بريدك الإلكتروني! 🎉'
    })


@app.route('/api/coupon/validate', methods=['POST'])
def validate_coupon():
    data = request.get_json()
    code = (data or {}).get('code', '').strip().upper()

    if not code:
        return jsonify({'valid': False, 'error': 'أدخل كود الكوبون'}), 400

    coupons = load_coupons()

    if code not in coupons:
        return jsonify({'valid': False, 'error': 'كوبون غير صالح ❌'}), 404

    if coupons[code]['used']:
        return jsonify({'valid': False, 'error': 'هذا الكوبون مستخدم بالفعل ❌'}), 410

    return jsonify({
        'valid': True,
        'discount': coupons[code]['discount'],
        'message': 'تم تطبيق الخصم بنجاح! 🎉'
    })


@app.route('/api/coupon/use', methods=['POST'])
def use_coupon():
    data = request.get_json()
    code = (data or {}).get('code', '').strip().upper()

    coupons = load_coupons()

    if code not in coupons:
        return jsonify({'success': False, 'error': 'كوبون غير صالح'}), 404

    if coupons[code]['used']:
        return jsonify({'success': False, 'error': 'هذا الكوبون مستخدم بالفعل'}), 410

    coupons[code]['used'] = True
    coupons[code]['used_at'] = datetime.now().isoformat()
    save_coupons(coupons)

    return jsonify({'success': True, 'discount': coupons[code]['discount']})


# ── Serve static files ──────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)


if __name__ == '__main__':
    if not SMTP_PASSWORD:
        print('\n⚠️  UDREAM_APP_PASSWORD not set. Emails will NOT be sent.')
        print('   Set it with: $env:UDREAM_APP_PASSWORD = "your-gmail-app-password"\n')
    print('🚀 Udream server running at http://localhost:8000')
    app.run(host='0.0.0.0', port=8000, debug=True)
