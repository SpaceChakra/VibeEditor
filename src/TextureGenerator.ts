import * as THREE from 'three';

export interface TextureConfig {
    name: string;
    groundColor: number;
    skyColor: number;
    fogColor: number;
    wallColor: number;
    roughness: number;
    fogDensity: number;
}

export class TextureGenerator {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private textureCache: Map<string, THREE.Texture> = new Map();

    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d')!;
    }

    private resize(w: number, h: number) {
        this.canvas.width = w;
        this.canvas.height = h;
    }

    private createNoise(w: number, h: number, scale: number = 1): number[][] {
        const data: number[][] = [];
        for (let y = 0; y < h; y++) {
            data[y] = [];
            for (let x = 0; x < w; x++) {
                const nx = x / scale;
                const ny = y / scale;
                const noise = (Math.sin(nx * 12.9898 + ny * 78.233) * 43758.5453) % 1;
                data[y][x] = Math.abs(noise);
            }
        }
        return data;
    }

    private smoothNoise(data: number[][], iterations: number = 2): number[][] {
        let result = data;
        for (let iter = 0; iter < iterations; iter++) {
            const newData: number[][] = [];
            const h = result.length;
            const w = result[0].length;
            for (let y = 0; y < h; y++) {
                newData[y] = [];
                for (let x = 0; x < w; x++) {
                    let sum = 0;
                    let count = 0;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const ny = (y + dy + h) % h;
                            const nx = (x + dx + w) % w;
                            sum += result[ny][nx];
                            count++;
                        }
                    }
                    newData[y][x] = sum / count;
                }
            }
            result = newData;
        }
        return result;
    }

    private hexToRgb(hex: number): { r: number, g: number, b: number } {
        return {
            r: (hex >> 16) & 255,
            g: (hex >> 8) & 255,
            b: hex & 255
        };
    }

    public generateSkyTexture(topColor: number, bottomColor: number, width: number = 512, height: number = 256): THREE.Texture {
        const cacheKey = `sky_${topColor}_${bottomColor}_${width}x${height}`;
        if (this.textureCache.has(cacheKey)) {
            return this.textureCache.get(cacheKey)!;
        }

        this.resize(width, height);
        const gradient = this.ctx.createLinearGradient(0, 0, 0, height);
        const top = '#' + topColor.toString(16).padStart(6, '0');
        const bottom = '#' + bottomColor.toString(16).padStart(6, '0');
        gradient.addColorStop(0, top);
        gradient.addColorStop(0.5, bottom);
        gradient.addColorStop(1, '#0a0a0a');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, width, height);

        this.addCloudNoise(width, height, 0.15);

        const texture = new THREE.CanvasTexture(this.canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.needsUpdate = true;
        this.textureCache.set(cacheKey, texture);
        return texture;
    }

    private addCloudNoise(width: number, height: number, opacity: number = 0.1) {
        const imageData = this.ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        for (let y = 0; y < height; y += 4) {
            for (let x = 0; x < width; x += 4) {
                const noise = Math.random();
                if (noise > 0.7) {
                    const alpha = (noise - 0.7) * 3.3 * opacity * 255;
                    for (let dy = 0; dy < 4 && y + dy < height; dy++) {
                        for (let dx = 0; dx < 4 && x + dx < width; dx++) {
                            const idx = ((y + dy) * width + (x + dx)) * 4;
                            data[idx + 3] = Math.min(255, data[idx + 3] + alpha);
                        }
                    }
                }
            }
        }
        this.ctx.putImageData(imageData, 0, 0);
    }

    public generateGroundTexture(baseColor: number, type: 'wood' | 'stone' | 'dirt' | 'grass' | 'sand' | 'marble' | 'tiles' | 'blood', width: number = 256, height: number = 256): THREE.Texture {
        const cacheKey = `ground_${type}_${baseColor}_${width}x${height}`;
        if (this.textureCache.has(cacheKey)) {
            return this.textureCache.get(cacheKey)!;
        }

        this.resize(width, height);
        const rgb = this.hexToRgb(baseColor);

        switch (type) {
            case 'wood':
                this.generateWoodPlanks(rgb.r, rgb.g, rgb.b);
                break;
            case 'stone':
                this.generateStoneGround(rgb.r, rgb.g, rgb.b);
                break;
            case 'dirt':
                this.generateDirtGround(rgb.r, rgb.g, rgb.b);
                break;
            case 'grass':
                this.generateGrassGround(rgb.r, rgb.g, rgb.b);
                break;
            case 'sand':
                this.generateSandGround(rgb.r, rgb.g, rgb.b);
                break;
            case 'marble':
                this.generateMarbleGround(rgb.r, rgb.g, rgb.b);
                break;
            case 'tiles':
                this.generateTileGround(rgb.r, rgb.g, rgb.b);
                break;
            case 'blood':
                this.generateBloodStained(rgb.r, rgb.g, rgb.b);
                break;
        }

        const texture = new THREE.CanvasTexture(this.canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.needsUpdate = true;
        this.textureCache.set(cacheKey, texture);
        return texture;
    }

    private generateWoodPlanks(r: number, g: number, b: number) {
        this.ctx.fillStyle = `rgb(${r},${g},${b})`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        const plankWidth = 32;
        for (let x = 0; x < this.canvas.width; x += plankWidth) {
            const variation = Math.random() * 30 - 15;
            this.ctx.fillStyle = `rgb(${Math.max(0, r + variation)},${Math.max(0, g + variation)},${Math.max(0, b + variation)})`;
            this.ctx.fillRect(x, 0, plankWidth - 2, this.canvas.height);
            
            for (let y = 0; y < this.canvas.height; y += 8 + Math.random() * 12) {
                this.ctx.strokeStyle = `rgb(${Math.max(0, r - 40)},${Math.max(0, g - 40)},${Math.max(0, b - 40)})`;
                this.ctx.beginPath();
                this.ctx.moveTo(x, y);
                this.ctx.lineTo(x + plankWidth, y + (Math.random() - 0.5) * 4);
                this.ctx.stroke();
            }
        }
    }

    private generateStoneGround(r: number, g: number, b: number) {
        this.ctx.fillStyle = `rgb(${r},${g},${b})`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        const noise = this.createNoise(64, 64, 8);
        const smooth = this.smoothNoise(noise, 3);
        
        for (let y = 0; y < 64; y++) {
            for (let x = 0; x < 64; x++) {
                const brightness = smooth[y][x] * 60 - 30;
                const px = x * 4;
                const py = y * 4;
                this.ctx.fillStyle = `rgb(${Math.max(0, r + brightness)},${Math.max(0, g + brightness)},${Math.max(0, b + brightness)})`;
                this.ctx.fillRect(px, py, 4, 4);
            }
        }
    }

    private generateDirtGround(r: number, g: number, b: number) {
        for (let y = 0; y < this.canvas.height; y++) {
            for (let x = 0; x < this.canvas.width; x++) {
                const noise = Math.random() * 40 - 20;
                const r2 = Math.max(0, Math.min(255, r + noise));
                const g2 = Math.max(0, Math.min(255, g + noise * 0.8));
                const b2 = Math.max(0, Math.min(255, b + noise * 0.6));
                this.ctx.fillStyle = `rgb(${r2},${g2},${b2})`;
                this.ctx.fillRect(x, y, 1, 1);
            }
        }
    }

    private generateGrassGround(r: number, g: number, b: number) {
        for (let y = 0; y < this.canvas.height; y++) {
            for (let x = 0; x < this.canvas.width; x++) {
                const noise = Math.random() * 50 - 25;
                const streak = Math.sin(x * 0.3 + y * 0.1) * 15;
                const r2 = Math.max(0, Math.min(255, r + noise));
                const g2 = Math.max(0, Math.min(255, g + noise + streak));
                const b2 = Math.max(0, Math.min(255, b + noise * 0.5));
                this.ctx.fillStyle = `rgb(${r2},${g2},${b2})`;
                this.ctx.fillRect(x, y, 1, 1);
            }
        }
    }

    private generateSandGround(r: number, g: number, b: number) {
        for (let y = 0; y < this.canvas.height; y++) {
            for (let x = 0; x < this.canvas.width; x++) {
                const noise = Math.random() * 25 - 12;
                const grain = Math.random() > 0.95 ? 30 : 0;
                const r2 = Math.max(0, Math.min(255, r + noise + grain));
                const g2 = Math.max(0, Math.min(255, g + noise + grain));
                const b2 = Math.max(0, Math.min(255, b + noise + grain));
                this.ctx.fillStyle = `rgb(${r2},${g2},${b2})`;
                this.ctx.fillRect(x, y, 1, 1);
            }
        }
    }

    private generateMarbleGround(r: number, g: number, b: number) {
        this.ctx.fillStyle = `rgb(${r},${g},${b})`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        for (let i = 0; i < 20; i++) {
            const x = Math.random() * this.canvas.width;
            const y = Math.random() * this.canvas.height;
            const radius = 20 + Math.random() * 80;
            const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, radius);
            gradient.addColorStop(0, `rgba(${r + 40},${g + 40},${b + 40},0.3)`);
            gradient.addColorStop(1, 'rgba(0,0,0,0)');
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
        
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const data = imageData.data;
        for (let y = 1; y < this.canvas.height - 1; y++) {
            for (let x = 1; x < this.canvas.width - 1; x++) {
                const idx = (y * this.canvas.width + x) * 4;
                const idxLeft = (y * this.canvas.width + x - 1) * 4;
                const idxTop = ((y - 1) * this.canvas.width + x) * 4;
                data[idx] = (data[idx] + data[idxLeft] + data[idxTop]) / 3;
                data[idx + 1] = (data[idx + 1] + data[idxLeft + 1] + data[idxTop + 1]) / 3;
                data[idx + 2] = (data[idx + 2] + data[idxLeft + 2] + data[idxTop + 2]) / 3;
            }
        }
        this.ctx.putImageData(imageData, 0, 0);
    }

    private generateTileGround(r: number, g: number, b: number) {
        const tileSize = 32;
        this.ctx.fillStyle = `rgb(${Math.max(0, r - 20)},${Math.max(0, g - 20)},${Math.max(0, b - 20)})`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        for (let y = 0; y < this.canvas.height; y += tileSize) {
            for (let x = 0; x < this.canvas.width; x += tileSize) {
                const variation = Math.random() * 20 - 10;
                this.ctx.fillStyle = `rgb(${r + variation},${g + variation},${b + variation})`;
                this.ctx.fillRect(x + 1, y + 1, tileSize - 2, tileSize - 2);
            }
        }
    }

    private generateBloodStained(r: number, g: number, b: number) {
        this.ctx.fillStyle = `rgb(${r},${g},${b})`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        for (let i = 0; i < 15; i++) {
            const x = Math.random() * this.canvas.width;
            const y = Math.random() * this.canvas.height;
            const radius = 10 + Math.random() * 30;
            const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, radius);
            gradient.addColorStop(0, `rgba(${Math.max(0, r - 60)},0,0,0.8)`);
            gradient.addColorStop(0.5, `rgba(${Math.max(0, r - 80)},0,0,0.4)`);
            gradient.addColorStop(1, 'rgba(0,0,0,0)');
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    public generateWallTexture(baseColor: number, type: 'stone' | 'wood' | 'brick' | 'plaster' | 'metal', width: number = 256, height: number = 256): THREE.Texture {
        const cacheKey = `wall_${type}_${baseColor}_${width}x${height}`;
        if (this.textureCache.has(cacheKey)) {
            return this.textureCache.get(cacheKey)!;
        }

        this.resize(width, height);
        const rgb = this.hexToRgb(baseColor);

        switch (type) {
            case 'stone':
                this.generateStoneWall(rgb.r, rgb.g, rgb.b);
                break;
            case 'wood':
                this.generateWoodWall(rgb.r, rgb.g, rgb.b);
                break;
            case 'brick':
                this.generateBrickWall(rgb.r, rgb.g, rgb.b);
                break;
            case 'plaster':
                this.generatePlasterWall(rgb.r, rgb.g, rgb.b);
                break;
            case 'metal':
                this.generateMetalWall(rgb.r, rgb.g, rgb.b);
                break;
        }

        const texture = new THREE.CanvasTexture(this.canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.needsUpdate = true;
        this.textureCache.set(cacheKey, texture);
        return texture;
    }

    private generateStoneWall(r: number, g: number, b: number) {
        this.ctx.fillStyle = `rgb(${r},${g},${b})`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        const rowHeight = 12; // Even smaller bricks for more detail
        for (let row = 0; row < this.canvas.height; row += rowHeight) {
            const offset = (Math.floor(row / rowHeight) % 2) * 10;
            for (let x = -20; x < this.canvas.width + 20; x += 20) {
                const bx = x + offset;
                const variation = Math.random() * 15 - 7;
                this.ctx.fillStyle = `rgb(${r + variation},${g + variation},${b + variation})`;
                this.ctx.fillRect(bx + 1, row + 1, 18, rowHeight - 2);
                
                // Very defined mortar lines (darker and thicker relative to brick size)
                this.ctx.strokeStyle = `rgb(${Math.max(0, r - 100)},${Math.max(0, g - 100)},${Math.max(0, b - 100)})`;
                this.ctx.lineWidth = 1.2;
                this.ctx.strokeRect(bx + 1, row + 1, 18, rowHeight - 2);
            }
        }
    }

    private generateWoodWall(r: number, g: number, b: number) {
        const plankHeight = 20;
        for (let y = 0; y < this.canvas.height; y += plankHeight) {
            const variation = Math.random() * 20 - 10;
            this.ctx.fillStyle = `rgb(${r + variation},${g + variation},${b + variation})`;
            this.ctx.fillRect(0, y, this.canvas.width, plankHeight - 1);
            
            this.ctx.strokeStyle = `rgb(${Math.max(0, r - 40)},${Math.max(0, g - 40)},${Math.max(0, b - 40)})`;
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }

    private generateBrickWall(r: number, g: number, b: number) {
        this.ctx.fillStyle = `rgb(${Math.max(0, r - 30)},${Math.max(0, g - 30)},${Math.max(0, b - 30)})`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        const brickW = 40;
        const brickH = 20;
        for (let row = 0; row < this.canvas.height; row += brickH) {
            const offset = (Math.floor(row / brickH) % 2) * (brickW / 2);
            for (let x = -brickW; x < this.canvas.width + brickW; x += brickW) {
                const bx = x + offset;
                const variation = Math.random() * 25 - 12;
                this.ctx.fillStyle = `rgb(${r + variation},${g + variation},${b + variation})`;
                this.ctx.fillRect(bx + 1, row + 1, brickW - 2, brickH - 2);
            }
        }
    }

    private generatePlasterWall(r: number, g: number, b: number) {
        for (let y = 0; y < this.canvas.height; y++) {
            for (let x = 0; x < this.canvas.width; x++) {
                const noise = Math.random() * 20 - 10;
                this.ctx.fillStyle = `rgb(${r + noise},${g + noise},${b + noise})`;
                this.ctx.fillRect(x, y, 1, 1);
            }
        }
    }

    private generateMetalWall(r: number, g: number, b: number) {
        this.ctx.fillStyle = `rgb(${r},${g},${b})`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        for (let i = 0; i < this.canvas.width; i += 8) {
            const gradient = this.ctx.createLinearGradient(i, 0, i, this.canvas.height);
            gradient.addColorStop(0, 'rgba(255,255,255,0.1)');
            gradient.addColorStop(0.5, 'rgba(0,0,0,0)');
            gradient.addColorStop(1, 'rgba(255,255,255,0.1)');
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(i, 0, 4, this.canvas.height);
        }
    }

    public generateWaterTexture(baseColor: number, width: number = 256, height: number = 256): THREE.Texture {
        const cacheKey = `water_${baseColor}_${width}x${height}`;
        if (this.textureCache.has(cacheKey)) {
            return this.textureCache.get(cacheKey)!;
        }

        this.resize(width, height);
        const rgb = this.hexToRgb(baseColor);
        
        this.ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
        this.ctx.fillRect(0, 0, width, height);
        
        for (let y = 0; y < height; y += 20) {
            this.ctx.strokeStyle = `rgba(${Math.max(0, rgb.r - 30)},${Math.max(0, rgb.g - 30)},${Math.max(0, rgb.b - 30)},0.3)`;
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            for (let x = 0; x <= width; x += 10) {
                this.ctx.lineTo(x, y + Math.sin(x * 0.05 + y * 0.02) * 3);
            }
            this.ctx.stroke();
        }

        const texture = new THREE.CanvasTexture(this.canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.needsUpdate = true;
        this.textureCache.set(cacheKey, texture);
        return texture;
    }

    public generateFabricTexture(baseColor: number, width: number = 128, height: number = 128): THREE.Texture {
        const cacheKey = `fabric_${baseColor}_${width}x${height}`;
        if (this.textureCache.has(cacheKey)) {
            return this.textureCache.get(cacheKey)!;
        }

        this.resize(width, height);
        const rgb = this.hexToRgb(baseColor);
        
        this.ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
        this.ctx.fillRect(0, 0, width, height);
        
        for (let y = 0; y < height; y += 2) {
            for (let x = 0; x < width; x += 2) {
                const noise = Math.random() * 10 - 5;
                this.ctx.fillStyle = `rgb(${rgb.r + noise},${rgb.g + noise},${rgb.b + noise})`;
                this.ctx.fillRect(x, y, 2, 2);
            }
        }

        const texture = new THREE.CanvasTexture(this.canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.needsUpdate = true;
        this.textureCache.set(cacheKey, texture);
        return texture;
    }

    public clearCache() {
        this.textureCache.forEach(tex => tex.dispose());
        this.textureCache.clear();
    }
}

export const textureGenerator = new TextureGenerator();
