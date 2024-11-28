let captchaValue = '';

function generateCaptcha() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

function drawCaptcha(canvas, text) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // 清空画布
    ctx.clearRect(0, 0, width, height);

    // 设置背景
    ctx.fillStyle = '#f0f2f5';
    ctx.fillRect(0, 0, width, height);

    // 绘制干扰线
    for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * width, Math.random() * height);
        ctx.lineTo(Math.random() * width, Math.random() * height);
        ctx.strokeStyle = `rgba(${Math.random() * 255},${Math.random() * 255},${Math.random() * 255},0.5)`;
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // 绘制干扰点
    for (let i = 0; i < 50; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * width, Math.random() * height, 1, 0, 2 * Math.PI);
        ctx.fillStyle = `rgba(${Math.random() * 255},${Math.random() * 255},${Math.random() * 255},0.5)`;
        ctx.fill();
    }

    // 绘制文字
    const chars = text.split('');
    chars.forEach((char, i) => {
        ctx.save();
        ctx.font = 'bold 24px Arial';
        ctx.translate(15 + i * 20, height / 2);
        ctx.rotate((Math.random() - 0.5) * 0.3);
        
        // 随机颜色
        const hue = Math.random() * 360;
        ctx.fillStyle = `hsl(${hue}, 70%, 40%)`;
        
        ctx.fillText(char, 0, 0);
        ctx.restore();
    });
}

function refreshCaptcha() {
    captchaValue = generateCaptcha();
    const captchaDiv = document.getElementById('captchaCode');
    
    // 清空原有内容
    captchaDiv.innerHTML = '';
    
    // 创建canvas元素
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 38;
    captchaDiv.appendChild(canvas);
    
    // 绘制验证码
    drawCaptcha(canvas, captchaValue);
}

// 添加登录处理函数
function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const captchaInput = document.getElementById('captcha').value;
    
    if (captchaInput !== captchaValue) {
        alert('验证码错误，请重新输入');
        refreshCaptcha();
        document.getElementById('captcha').value = '';
        return false;
    }
    
    // TODO: 在这里添加登录逻辑
    console.log('登录信息:', { username, password });
    return false;
}

// 添加注册处理函数
function handleRegister(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const captchaInput = document.getElementById('captcha').value;
    
    if (password !== confirmPassword) {
        alert('两次输入的密码不一致');
        return false;
    }
    
    if (captchaInput !== captchaValue) {
        alert('验证码错误，请重新输入');
        refreshCaptcha();
        document.getElementById('captcha').value = '';
        return false;
    }
    
    // TODO: 在这里添加注册逻辑
    console.log('注册信息:', { username, email, password });
    return false;
}

// 其他处理函数保持不变...

// 页面加载完成后立即生成验证码
document.addEventListener('DOMContentLoaded', refreshCaptcha);
// 为了确保验证码显示，也可以直接执行一次
refreshCaptcha();