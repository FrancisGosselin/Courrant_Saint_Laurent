import React, { useState, useRef } from 'react';
import Map, { Marker, Popup } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { mat4 } from 'gl-matrix';

class ParticleLayer {
  id = 'null-island';
  type = 'custom';
  renderingMode = '2d';
  program: WebGLProgram = null;
  map: any = null;
  particleX = -180; // Start at left edge of world
  particleY = 0;    // Equator
  speed = 0.5;      // Degrees per frame
  trail: Array<{x: number, y: number, age: number}> = []; // Trail positions with age
  maxTrailLength = 20; // Maximum number of trail segments
  vertexBuffer: WebGLBuffer = null;
  private isMoving = false;
  private resetTimeout: number | null = null;

    constructor() {
        this.id = 'null-island';
        this.type = 'custom';
        this.renderingMode = '2d';
    }

     onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext) {
        this.map = map;
        
        const vertexSource = `#version 300 es
        uniform mat4 u_matrix;
        uniform vec2 u_position;
        void main() {
            gl_Position = u_matrix * vec4(u_position, 0.0, 1.0);
            gl_PointSize = 10.0;
        }`;

        const fragmentSource = `#version 300 es
        precision mediump float;
        uniform float u_alpha;
        out vec4 fragColor;
        void main() {
            vec2 center = gl_PointCoord - vec2(0.5);
            float dist = length(center);
            if (dist > 0.5) {
                discard;
            }
            float alpha = (1.0 - dist * 2.0) * u_alpha;
            fragColor = vec4(1.0, 0.0, 0.0, alpha);
        }`;

        const vertexShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertexShader, vertexSource);
        gl.compileShader(vertexShader);
        
        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
            console.error('Vertex shader compile error:', gl.getShaderInfoLog(vertexShader));
            return;
        }

        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragmentShader, fragmentSource);
        gl.compileShader(fragmentShader);
        
        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
            console.error('Fragment shader compile error:', gl.getShaderInfoLog(fragmentShader));
            return;
        }

        this.program = gl.createProgram();
        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);
        gl.linkProgram(this.program);
        gl.useProgram(this.program);
        
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error('Program link error:', gl.getProgramInfoLog(this.program));
            return;
        }
        
        // Create vertex buffer for trail points
        this.vertexBuffer = gl.createBuffer();
        
        // Set up map movement event handlers
        this.setupMapEventHandlers();
        
        console.log("Program created successfully");
    }
    
    setupMapEventHandlers() {
        if (!this.map) return;
        
        // Handle map movement to reset particles
        this.map.on('movestart', () => {
            this.isMoving = true;
            if (this.resetTimeout) {
                clearTimeout(this.resetTimeout);
                this.resetTimeout = null;
            }
        });
        
        this.map.on('moveend', () => {
            this.isMoving = false;
            this.scheduleParticleReset();
        });
        
        this.map.on('zoomstart', () => {
            this.isMoving = true;
            if (this.resetTimeout) {
                clearTimeout(this.resetTimeout);
                this.resetTimeout = null;
            }
        });
        
        this.map.on('zoomend', () => {
            this.isMoving = false;
            this.scheduleParticleReset();
        });
    }
    
    scheduleParticleReset() {
        if (this.resetTimeout) {
            clearTimeout(this.resetTimeout);
        }
        
        this.resetTimeout = window.setTimeout(() => {
            this.resetParticles();
            console.log('Simple particles reset after map movement');
            this.resetTimeout = null;
        }, 100);
    }
    
    resetParticles() {
        // Reset particle position and clear trail
        this.particleX = -180;
        this.particleY = 0;
        this.trail = [];
    }

    

    render(gl: WebGLRenderingContext | WebGL2RenderingContext, modelViewProjectionMatrix: Float32Array){
        if (!this.program) return;

        gl.useProgram(this.program);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Only update particles when not moving the map
        if (!this.isMoving) {
            // Update particle position
            this.particleX += this.speed;
            if (this.particleX > 180) {
                this.particleX = -180; // Loop back to start
            }

            // Add current position to trail
            this.trail.push({x: this.particleX, y: this.particleY, age: 0});
            
            // Update trail ages and remove old segments
            this.trail = this.trail.map(segment => ({...segment, age: segment.age + 1}))
                                  .filter(segment => segment.age < this.maxTrailLength);
        }

        let degreesToDec = mat4.fromValues(
            1/180, 0,     0, 0,
            0,     1/180, 0, 0,
            0,     0,     1, 0,
            0,     0,     0, 1
        );
        
        let result = mat4.create();
        mat4.multiply(result, modelViewProjectionMatrix as any, degreesToDec);
        
        // Set matrix uniform
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, "u_matrix"), false, result);
        
        // Only render if not moving to avoid visual artifacts
        if (!this.isMoving) {
            // Render trail segments with fading alpha
            this.trail.forEach((segment, index) => {
                const alpha = 1.0 - (segment.age / this.maxTrailLength);
                gl.uniform1f(gl.getUniformLocation(this.program, "u_alpha"), alpha * 0.8); // Trail is more transparent
                gl.uniform2f(gl.getUniformLocation(this.program, "u_position"), segment.x + 90, segment.y + 90);
                gl.drawArrays(gl.POINTS, 0, 1);
            });
            
            // Render main particle with full alpha
            gl.uniform1f(gl.getUniformLocation(this.program, "u_alpha"), 1.0);
            gl.uniform2f(gl.getUniformLocation(this.program, "u_position"), this.particleX + 90, this.particleY + 90);
            gl.drawArrays(gl.POINTS, 0, 1);
        }
        
        // Continue animation
        this.map.triggerRepaint();
    }
    
    onRemove() {
        // Cleanup when layer is removed
        if (this.resetTimeout) {
            clearTimeout(this.resetTimeout);
            this.resetTimeout = null;
        }
        
        // Remove map event listeners
        if (this.map) {
            this.map.off('movestart');
            this.map.off('moveend');
            this.map.off('zoomstart');
            this.map.off('zoomend');
        }
        
        this.map = null;
    }
}

const WorldMap: React.FC = () => {
  const mapRef = useRef();
  
  const handleMapLoad = () => {
    const map = mapRef.current?.getMap();
    if (map) {
      map.addLayer(new ParticleLayer());
    }
  };

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: 0,
          latitude: 20,
          zoom: 2
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="https://tiles.openfreemap.org/styles/liberty"
        onLoad={handleMapLoad}
      >
       
      </Map>
    </div>
  );
};

export default WorldMap;