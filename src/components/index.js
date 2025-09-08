
import * as util from './util';

import drawVert from './shaders/draw.vert.glsl?raw';
import drawFrag from './shaders/draw.frag.glsl?raw';

import quadVert from './shaders/quad.vert.glsl?raw';

import screenFrag from './shaders/screen.frag.glsl?raw';
import updateSpeedFrag from './shaders/updateSpeed.frag.glsl?raw';
import updatePositionFrag from './shaders/updatePosition.frag.glsl?raw';

const defaultRampColors = {
    0.0: '#3288bd',
    0.1: '#66c2a5',
    0.2: '#abdda4',
    0.3: '#e6f598',
    0.4: '#fee08b',
    0.5: '#fdae61',
    0.6: '#f46d43',
    1.0: '#d53e4f'
};

export default class WindGL {
    constructor(gl) {
        this.gl = gl;

        // Remove the problematic setWind call - will be handled externally

        this.fadeOpacity = 0.996; // how fast the particle trails fade on each frame
        this.speedFactor = 0.25; // how fast the particles move
        this.dropRate = 0.003; // how often the particles move to a random place
        this.dropRateBump = 0.01; // drop rate increase relative to individual particle speed

        this.drawProgram = util.createProgram(gl, drawVert, drawFrag);
        this.screenProgram = util.createProgram(gl, quadVert, screenFrag);
        this.updateSpeedProgram = util.createProgram(gl, quadVert, updateSpeedFrag);
        this.updatePositionProgram = util.createProgram(gl, quadVert, updatePositionFrag);

        this.quadBuffer = util.createBuffer(gl, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]));
        this.framebuffer = gl.createFramebuffer();

        this.setColorRamp(defaultRampColors);
        this.resize();
        
        // Initialize windData and windTexture as null
        this.windData = null;
        this.windTexture = null;
    }

    resize() {
        const gl = this.gl;
        const emptyPixels = new Uint8Array(gl.canvas.width * gl.canvas.height * 4);
        // screen textures to hold the drawn screen for the previous and the current frame
        this.backgroundTexture = util.createTexture(gl, gl.NEAREST, emptyPixels, gl.canvas.width, gl.canvas.height);
        this.screenTexture = util.createTexture(gl, gl.NEAREST, emptyPixels, gl.canvas.width, gl.canvas.height);
    }

    setColorRamp(colors) {
        // lookup texture for colorizing the particles according to their speed
        this.colorRampTexture = util.createTexture(this.gl, this.gl.LINEAR, getColorRamp(colors), 16, 16);
    }

    set numParticles(numParticles) {
        const gl = this.gl;

        // we create a square texture where each pixel will hold a particle position encoded as RGBA
        const particleRes = this.particleStateResolution = Math.ceil(Math.sqrt(numParticles));
        this._numParticles = particleRes * particleRes;

        const particleState = new Uint8Array(this._numParticles * 4);
        const particleSpeed = new Uint8Array(this._numParticles * 4);
        
        for (let i = 0; i < particleState.length; i++) {
            particleState[i] = Math.floor(Math.random() * 256); // randomize the initial particle positions
        }
        
        for (let i = 0; i < particleSpeed.length; i++) {
            particleSpeed[i] = 0; // initialize speed to 0
        }
        
        // textures to hold the particle state for the current and the next frame
        this.particleStateTexture0 = util.createTexture(gl, gl.NEAREST, particleState, particleRes, particleRes);
        this.particleStateTexture1 = util.createTexture(gl, gl.NEAREST, particleState, particleRes, particleRes);
        
        // textures to hold the particle speed for the current and the next frame
        this.particleSpeedTexture0 = util.createTexture(gl, gl.NEAREST, particleSpeed, particleRes, particleRes);
        this.particleSpeedTexture1 = util.createTexture(gl, gl.NEAREST, particleSpeed, particleRes, particleRes);

        const particleIndices = new Float32Array(this._numParticles);
        for (let i = 0; i < this._numParticles; i++) particleIndices[i] = i;
        this.particleIndexBuffer = util.createBuffer(gl, particleIndices);
    }
    get numParticles() {
        return this._numParticles;
    }

    // setWind function removed - handled externally
    
    setViewportBounds(bounds) {
        // bounds should be [min_lng, min_lat, max_lng, max_lat]
        this.viewportBounds = bounds;
        
        // Calculate normalized bounds for shaders
        const min_x = (bounds[0] + 180.0) / 360.0;  // west longitude (linear)
        const max_x = (bounds[2] + 180.0) / 360.0;  // east longitude (linear)
        
        // Web Mercator conversion for latitude
        const north_rad = bounds[3] * Math.PI / 180.0;
        const south_rad = bounds[1] * Math.PI / 180.0;
        const min_y = 0.5 - Math.log(Math.tan(Math.PI/4.0 + north_rad/2.0)) / (2.0 * Math.PI);
        const max_y = 0.5 - Math.log(Math.tan(Math.PI/4.0 + south_rad/2.0)) / (2.0 * Math.PI);
        
        this.normalizedBounds = [min_x, min_y, max_x, max_y];
    }

    resetParticles() {
        const gl = this.gl;
        
        if (!this.particleStateTexture0 || !this.particleStateTexture1 || !this.particleSpeedTexture0 || !this.particleSpeedTexture1) {
            return;
        }

        const particleRes = this.particleStateResolution;
        const numParticles = particleRes * particleRes;
        const particleState = new Uint8Array(numParticles * 4);
        const particleSpeed = new Uint8Array(numParticles * 4);
        
        for (let i = 0; i < particleState.length; i++) {
            particleState[i] = Math.floor(Math.random() * 256);
        }
        
        // Initialize speed to 0
        for (let i = 0; i < particleSpeed.length; i++) {
            particleSpeed[i] = 0;
        }
        
        // Update both particle state textures with new random positions
        gl.bindTexture(gl.TEXTURE_2D, this.particleStateTexture0);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, particleRes, particleRes, gl.RGBA, gl.UNSIGNED_BYTE, particleState);
        
        gl.bindTexture(gl.TEXTURE_2D, this.particleStateTexture1);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, particleRes, particleRes, gl.RGBA, gl.UNSIGNED_BYTE, particleState);
        
        // Update both particle speed textures with zero speed
        gl.bindTexture(gl.TEXTURE_2D, this.particleSpeedTexture0);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, particleRes, particleRes, gl.RGBA, gl.UNSIGNED_BYTE, particleSpeed);
        
        gl.bindTexture(gl.TEXTURE_2D, this.particleSpeedTexture1);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, particleRes, particleRes, gl.RGBA, gl.UNSIGNED_BYTE, particleSpeed);
        
        gl.bindTexture(gl.TEXTURE_2D, null);
        
        // Clear background textures for fresh start
        this.clearBackground();
    }
    
    clearBackground() {
        const gl = this.gl;
        const emptyPixels = new Uint8Array(gl.canvas.width * gl.canvas.height * 4);
        
        // Clear both background textures
        if (this.backgroundTexture) {
            gl.bindTexture(gl.TEXTURE_2D, this.backgroundTexture);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.canvas.width, gl.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, emptyPixels);
        }
        
        if (this.screenTexture) {
            gl.bindTexture(gl.TEXTURE_2D, this.screenTexture);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.canvas.width, gl.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, emptyPixels);
        }
        
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    draw(matrix = null) {
        const gl = this.gl;
        
        // Don't draw if wind data isn't loaded yet
        if (!this.windData || !this.windTexture) {
            return;
        }
        
        // Store the projection matrix for use in drawing
        this.projectionMatrix = matrix;
        
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.STENCIL_TEST);

        util.bindTexture(gl, this.windTexture, 0);
        util.bindTexture(gl, this.particleStateTexture0, 1);
        util.bindTexture(gl, this.particleSpeedTexture0, 3);

        this.drawScreen();
        this.updateParticlePosition();
        this.updateParticleSpeed();
    }

    drawScreen() {
        const gl = this.gl;
        // Disable trail rendering - just draw particles directly without background accumulation
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        this.drawParticles();
        gl.disable(gl.BLEND);
    }

    drawTexture(texture, opacity) {
        const gl = this.gl;
        const program = this.screenProgram;
        gl.useProgram(program.program);

        util.bindAttribute(gl, this.quadBuffer, program.a_pos, 2);
        util.bindTexture(gl, texture, 2);
        gl.uniform1i(program.u_screen, 2);
        gl.uniform1f(program.u_opacity, opacity);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    drawParticles() {
        const gl = this.gl;
        const program = this.drawProgram;
        gl.useProgram(program.program);

        util.bindAttribute(gl, this.particleIndexBuffer, program.a_index, 1);
        util.bindTexture(gl, this.colorRampTexture, 2);

        gl.uniform1i(program.u_wind, 0);
        gl.uniform1i(program.u_particles, 1);
        gl.uniform1i(program.u_color_ramp, 2);
        gl.uniform1i(program.u_particle_speed, 3);

        gl.uniform1f(program.u_particles_res, this.particleStateResolution);
        gl.uniform2f(program.u_wind_res, this.windData.width, this.windData.height);
        gl.uniform2f(program.u_wind_min, this.windData.uMin, this.windData.vMin);
        gl.uniform2f(program.u_wind_max, this.windData.uMax, this.windData.vMax);
        
        // Pass data bounds for wind data mapping
        if (this.windData && program.u_data_bounds) {
            gl.uniform4f(program.u_data_bounds,
                this.windData.minLong || -180,     // minLong
                this.windData.minLat || -90,       // minLat
                this.windData.longPerPixel || 1,   // longPerPixel
                this.windData.latPerPixel || 1     // latPerPixel
            );
        }
        
        // Pass normalized viewport bounds for particle positioning
        if (this.normalizedBounds && program.u_viewport_normalized_bounds) {
            gl.uniform4f(program.u_viewport_normalized_bounds,
                this.normalizedBounds[0], // min_x
                this.normalizedBounds[1], // min_y
                this.normalizedBounds[2], // max_x
                this.normalizedBounds[3]  // max_y
            );
        }
        
        // Pass the projection matrix if available
        if (this.projectionMatrix && program.u_matrix) {
            gl.uniformMatrix4fv(program.u_matrix, false, this.projectionMatrix);
        } else {
            // Fallback to identity matrix if no projection matrix provided
            const identityMatrix = new Float32Array([
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                0, 0, 0, 1
            ]);
            gl.uniformMatrix4fv(program.u_matrix, false, identityMatrix);
        }

        gl.drawArrays(gl.POINTS, 0, this._numParticles);
    }

    updateParticleSpeed() {
        const gl = this.gl;
        util.bindFramebuffer(gl, this.framebuffer, this.particleSpeedTexture1);
        gl.viewport(0, 0, this.particleStateResolution, this.particleStateResolution);

        const program = this.updateSpeedProgram;
        gl.useProgram(program.program);

        util.bindAttribute(gl, this.quadBuffer, program.a_pos, 2);

        gl.uniform1i(program.u_wind, 0);
        gl.uniform1i(program.u_particles, 1);

        gl.uniform2f(program.u_wind_res, this.windData.width, this.windData.height);
        gl.uniform2f(program.u_wind_min, this.windData.uMin, this.windData.vMin);
        gl.uniform2f(program.u_wind_max, this.windData.uMax, this.windData.vMax);
        
        // Pass data bounds for current data mapping
        if (this.windData && program.u_data_bounds) {
            gl.uniform4f(program.u_data_bounds,
                this.windData.minLong || -180,     // minLong
                this.windData.minLat || -90,       // minLat
                this.windData.longPerPixel || 1,   // longPerPixel
                this.windData.latPerPixel || 1     // latPerPixel
            );
        }
        
        // Pass normalized viewport bounds for particle spawning
        if (this.normalizedBounds && program.u_viewport_normalized_bounds) {
            gl.uniform4f(program.u_viewport_normalized_bounds,
                this.normalizedBounds[0], // min_x
                this.normalizedBounds[1], // min_y
                this.normalizedBounds[2], // max_x
                this.normalizedBounds[3]  // max_y
            );
        }

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    updateParticlePosition() {
        const gl = this.gl;
        util.bindFramebuffer(gl, this.framebuffer, this.particleStateTexture1);
        gl.viewport(0, 0, this.particleStateResolution, this.particleStateResolution);

        const program = this.updatePositionProgram;
        gl.useProgram(program.program);

        util.bindAttribute(gl, this.quadBuffer, program.a_pos, 2);

        gl.uniform1i(program.u_wind, 0);
        gl.uniform1i(program.u_particles, 1);
        gl.uniform1i(program.u_particle_speed, 3);

        gl.uniform1f(program.u_rand_seed, Math.random());
        gl.uniform2f(program.u_wind_res, this.windData.width, this.windData.height);
        gl.uniform2f(program.u_wind_min, this.windData.uMin, this.windData.vMin);
        gl.uniform2f(program.u_wind_max, this.windData.uMax, this.windData.vMax);
        gl.uniform1f(program.u_speed_factor, this.speedFactor);
        gl.uniform1f(program.u_drop_rate, this.dropRate);
        gl.uniform1f(program.u_drop_rate_bump, this.dropRateBump);
        
        // Pass viewport bounds for particle spawning
        if (this.viewportBounds && program.u_viewport_bounds) {
            gl.uniform4f(program.u_viewport_bounds, 
                this.viewportBounds[0], // min_lng
                this.viewportBounds[1], // min_lat  
                this.viewportBounds[2], // max_lng
                this.viewportBounds[3]  // max_lat
            );
        }
        
        // Pass data bounds for current data mapping
        if (this.windData && program.u_data_bounds) {
            gl.uniform4f(program.u_data_bounds,
                this.windData.minLong || -180,     // minLong
                this.windData.minLat || -90,       // minLat
                this.windData.longPerPixel || 1,   // longPerPixel
                this.windData.latPerPixel || 1     // latPerPixel
            );
        }
        
        // Pass normalized viewport bounds for particle spawning
        if (this.normalizedBounds && program.u_viewport_normalized_bounds) {
            gl.uniform4f(program.u_viewport_normalized_bounds,
                this.normalizedBounds[0], // min_x
                this.normalizedBounds[1], // min_y
                this.normalizedBounds[2], // max_x
                this.normalizedBounds[3]  // max_y
            );
        }

        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // swap the particle state textures so the new one becomes the current one
        const temp = this.particleStateTexture0;
        this.particleStateTexture0 = this.particleStateTexture1;
        this.particleStateTexture1 = temp;
        
        // swap the particle speed textures so the new one becomes the current one
        const tempSpeed = this.particleSpeedTexture0;
        this.particleSpeedTexture0 = this.particleSpeedTexture1;
        this.particleSpeedTexture1 = tempSpeed;
    }
}

function getColorRamp(colors) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = 256;
    canvas.height = 1;

    const gradient = ctx.createLinearGradient(0, 0, 256, 0);
    for (const stop in colors) {
        gradient.addColorStop(+stop, colors[stop]);
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 1);

    return new Uint8Array(ctx.getImageData(0, 0, 256, 1).data);
}
