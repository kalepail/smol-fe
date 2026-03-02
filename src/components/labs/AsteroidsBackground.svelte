<script lang="ts">
    import { onMount, onDestroy } from "svelte";

    // --- Configuration ---
    const SHIP_COLOR = "#e0f1f8";
    const FLAME_INNER = "#eebb18";
    const FLAME_OUTER = "#eebb18";
    const ASTEROID_COLORS = [
        "#8b31b2", // Purple
        "#2e79cc", // Blue
        "#1239a4", // Dark Blue
        "#efdc2e", // Yellow
        "#c0c0c0", // Silver
        "#ffd700", // Gold
    ];
    const SHIP_SIZE = 15;
    const SAFE_ZONE_RADIUS = 180; // Radius around center to avoid

    // --- Game State ---
    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D | null;
    let animationFrameId: number;

    class GameObject {
        x: number;
        y: number;
        vx: number;
        vy: number;
        radius: number;
        angle: number;
        dead: boolean = false;

        constructor(x: number, y: number, radius: number) {
            this.x = x;
            this.y = y;
            this.vx = 0;
            this.vy = 0;
            this.radius = radius;
            this.angle = 0;
        }

        update(width: number, height: number) {
            this.x += this.vx;
            this.y += this.vy;

            // Screen Wrap
            if (this.x < -this.radius) this.x = width + this.radius;
            if (this.x > width + this.radius) this.x = -this.radius;
            if (this.y < -this.radius) this.y = height + this.radius;
            if (this.y > height + this.radius) this.y = -this.radius;
        }
    }

    class Asteroid extends GameObject {
        color: string;
        rotationSpeed: number;

        constructor(x: number, y: number, radius: number) {
            super(x, y, radius);
            this.color =
                ASTEROID_COLORS[
                    Math.floor(Math.random() * ASTEROID_COLORS.length)
                ];
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 0.8 + 0.4;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
            this.rotationSpeed = (Math.random() - 0.5) * 0.1;
        }

        update(width: number, height: number) {
            super.update(width, height);
            this.angle += this.rotationSpeed;
        }

        draw(ctx: CanvasRenderingContext2D) {
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            const segments = 8;
            for (let i = 0; i < segments; i++) {
                const a = (i / segments) * Math.PI * 2 + this.angle;
                // jaggedness
                const r = this.radius + (i % 2 === 0 ? 0 : this.radius * 0.2);
                const px = this.x + Math.cos(a) * r;
                const py = this.y + Math.sin(a) * r;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.stroke();
        }
    }

    class Bullet extends GameObject {
        ttl: number = 60; // frames to live

        constructor(x: number, y: number, angle: number) {
            super(x, y, 2);
            this.vx = Math.cos(angle) * 8;
            this.vy = Math.sin(angle) * 8;
        }

        update(w: number, h: number) {
            super.update(w, h);
            this.ttl--;
            if (this.ttl <= 0) this.dead = true;
        }

        draw(ctx: CanvasRenderingContext2D) {
            ctx.fillStyle = SHIP_COLOR;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    class Ship extends GameObject {
        bullets: Bullet[] = [];
        cooldown: number = 0;
        thrusting: boolean = false;

        constructor(x: number, y: number) {
            super(x, y, SHIP_SIZE);
        }

        update(width: number, height: number, asteroids: Asteroid[] = []) {
            // --- AI LOGIC ---

            // 1. Identify threats
            let nearestThreat: Asteroid | null = null;
            let minDist = Infinity;

            for (const ast of asteroids) {
                const d = Math.hypot(ast.x - this.x, ast.y - this.y);
                if (d < minDist) {
                    minDist = d;
                    nearestThreat = ast;
                }
            }

            // 2. Center Avoidance Force
            const cx = width / 2;
            const cy = height / 2;
            const distToCenter = Math.hypot(cx - this.x, cy - this.y);
            let targetAngle = this.angle;
            let shouldThrust = false;
            let shouldShoot = false;

            if (distToCenter < SAFE_ZONE_RADIUS) {
                // Flee from center
                const angleToCenter = Math.atan2(cy - this.y, cx - this.x);
                targetAngle = angleToCenter + Math.PI; // Opposite direction
                shouldThrust = true;
            } else if (nearestThreat) {
                // 3. Combat Logic
                const angleToThread = Math.atan2(
                    nearestThreat.y - this.y,
                    nearestThreat.x - this.x,
                );

                // Aim at threat
                targetAngle = angleToThread;
                const angleDiff = Math.abs(
                    this.normalizeAngle(targetAngle - this.angle),
                );

                // Shoot if lined up
                if (angleDiff < 0.1 && minDist < 400) {
                    shouldShoot = true;
                }

                // Chase if too far (mobility)
                if (minDist > 200 && angleDiff < 0.5) {
                    shouldThrust = true;
                }

                // Evasive maneuvers if too close
                if (minDist < 100) {
                    // Back away
                    targetAngle += Math.PI;
                    shouldThrust = true;
                }
            }

            // Apply inputs
            const diff = this.normalizeAngle(targetAngle - this.angle);
            this.angle += diff * 0.08; // Turn speed

            this.thrusting = shouldThrust;
            if (shouldThrust) {
                this.vx += Math.cos(this.angle) * 0.12;
                this.vy += Math.sin(this.angle) * 0.12;
            }

            // Friction
            this.vx *= 0.985;
            this.vy *= 0.985;

            // Shoot
            if (this.cooldown > 0) this.cooldown--;
            if (shouldShoot && this.cooldown <= 0) {
                this.bullets.push(
                    new Bullet(
                        this.x + Math.cos(this.angle) * this.radius,
                        this.y + Math.sin(this.angle) * this.radius,
                        this.angle,
                    ),
                );
                this.cooldown = 15;
            }

            super.update(width, height);

            // Update Bullets
            for (const b of this.bullets) {
                b.update(width, height);
            }
            this.bullets = this.bullets.filter((b) => !b.dead);
        }

        normalizeAngle(a: number) {
            while (a > Math.PI) a -= Math.PI * 2;
            while (a < -Math.PI) a += Math.PI * 2;
            return a;
        }

        draw(ctx: CanvasRenderingContext2D) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.angle);

            // Draw Ship
            ctx.strokeStyle = SHIP_COLOR;
            ctx.fillStyle = "#111"; // Inner fill dark
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(10, 0);
            ctx.lineTo(-10, 10);
            ctx.lineTo(-5, 0);
            ctx.lineTo(-10, -10);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Draw Flame
            if (this.thrusting) {
                // Outer Flame
                ctx.strokeStyle = FLAME_OUTER;
                ctx.beginPath();
                ctx.moveTo(-6, 5);
                ctx.lineTo(-20, 0);
                ctx.lineTo(-6, -5);
                ctx.stroke();

                // Inner Flame
                ctx.strokeStyle = FLAME_INNER;
                ctx.beginPath();
                ctx.moveTo(-6, 3);
                ctx.lineTo(-15, 0);
                ctx.lineTo(-6, -3);
                ctx.stroke();
            }

            ctx.restore();

            // Draw Bullets
            for (const b of this.bullets) b.draw(ctx);
        }
    }

    // --- initialization ---
    let ship: Ship;
    let asteroids: Asteroid[] = [];
    let resizeHandler: (() => void) | null = null;
    let pendingSpawnTimeouts: ReturnType<typeof setTimeout>[] = [];

    onMount(() => {
        if (!canvas) return;
        ctx = canvas.getContext("2d");

        resizeHandler = () => {
            if (!canvas) return;
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;

            // Reset ship to safe zone top left if needed, or just outside center
            if (!ship) ship = new Ship(100, 100);
        };
        window.addEventListener("resize", resizeHandler);
        resizeHandler();

        // Spawn Asteroids
        for (let i = 0; i < 8; i++) {
            asteroids.push(
                new Asteroid(
                    Math.random() * canvas.width,
                    Math.random() * canvas.height,
                    20 + Math.random() * 30,
                ),
            );
        }

        const loop = () => {
            if (!ctx) return;
            const w = canvas.width;
            const h = canvas.height;

            ctx.clearRect(0, 0, w, h);

            // Updates
            ship.update(w, h, asteroids);
            for (const a of asteroids) a.update(w, h);

            // Collisions (Bullet -> Asteroid)
            for (const b of ship.bullets) {
                for (let i = asteroids.length - 1; i >= 0; i--) {
                    const a = asteroids[i];
                    const dist = Math.hypot(b.x - a.x, b.y - a.y);
                    if (dist < a.radius) {
                        // Hit!
                        b.dead = true;

                        // Split or destroy
                        if (a.radius > 20) {
                            // Split
                            asteroids.push(
                                new Asteroid(a.x, a.y, a.radius / 2),
                            );
                            asteroids.push(
                                new Asteroid(a.x, a.y, a.radius / 2),
                            );
                        }
                        asteroids.splice(i, 1); // remove old

                        // Respawn big one elsewhere to keep density
                        if (asteroids.length < 5) {
                            const spawnTimeout = setTimeout(() => {
                                // Spawn far from ship
                                let sx = Math.random() * w;
                                let sy = Math.random() * h;
                                if (Math.hypot(sx - ship.x, sy - ship.y) < 300)
                                    sx += 300;
                                asteroids.push(new Asteroid(sx, sy, 40));
                                // Remove from tracking array
                                const idx = pendingSpawnTimeouts.indexOf(spawnTimeout);
                                if (idx > -1) pendingSpawnTimeouts.splice(idx, 1);
                            }, 1000);
                            pendingSpawnTimeouts.push(spawnTimeout);
                        }
                    }
                }
            }

            // Render
            for (const a of asteroids) a.draw(ctx);
            ship.draw(ctx);

            animationFrameId = requestAnimationFrame(loop);
        };

        loop();
    });

    onDestroy(() => {
        if (typeof window !== "undefined") {
            cancelAnimationFrame(animationFrameId);
            if (resizeHandler) {
                window.removeEventListener("resize", resizeHandler);
                resizeHandler = null;
            }
            // Clear all pending spawn timeouts
            pendingSpawnTimeouts.forEach(t => clearTimeout(t));
            pendingSpawnTimeouts = [];
        }
    });
</script>

<canvas
    bind:this={canvas}
    class="absolute inset-0 w-full h-full pointer-events-none z-0"
></canvas>
