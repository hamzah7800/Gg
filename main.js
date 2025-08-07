const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let shuttle = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  vx: 0,
  vy: 0,
  radius: 10
};

canvas.addEventListener('touchstart', e => {
  const touch = e.touches[0];
  const dx = touch.clientX - shuttle.x;
  const dy = touch.clientY - shuttle.y;
  shuttle.vx = dx * 0.05;
  shuttle.vy = dy * 0.05;
});

function update() {
  shuttle.x += shuttle.vx;
  shuttle.y += shuttle.vy;
  shuttle.vx *= 0.95;
  shuttle.vy *= 0.95;

  // bounce
  if (shuttle.x <= 0 || shuttle.x >= canvas.width) shuttle.vx *= -1;
  if (shuttle.y <= 0 || shuttle.y >= canvas.height) shuttle.vy *= -1;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  ctx.arc(shuttle.x, shuttle.y, shuttle.radius, 0, Math.PI * 2);
  ctx.fillStyle = '#000';
  ctx.fill();
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

loop();
