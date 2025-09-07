import React, { useState, useRef } from 'react';
import Map, { Marker, Popup } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { mat4 } from 'gl-matrix';
import WindGL from './index.js';

class WindGLLayer {
  id = 'wind-layer';
  type = 'custom';
  renderingMode = '2d';
  windGL: WindGL = null;
  map: any = null;
  private lastViewState: any = null;
  private clearBackgroundTimeout: number | null = null;
  private isMoving: boolean = false;
  private isZooming: boolean = false;
  private movingTimeout: number | null = null;

  constructor() {
    this.id = 'wind-layer';
    this.type = 'custom';
    this.renderingMode = '2d';
  }

  onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    
    // Initialize WindGL with the WebGL context
    this.windGL = new WindGL(gl);
    
    // Configure WindGL parameters - increased particle count since no trails
    this.windGL.numParticles = 50000; // Higher particle count for better coverage
    this.windGL.fadeOpacity = 0.985; // Not used without trails, but keep for consistency
    this.windGL.speedFactor = 0.12; // Slower, more visible movement
    this.windGL.dropRate = 0.002; // Moderate particle respawn
    this.windGL.dropRateBump = 0.008; // Balanced speed-based respawn rate
    
    // Load wind data
    this.loadWindData();
    
    // Set up map movement event handlers
    this.setupMapEventHandlers();
    
    console.log("WindGL layer initialized successfully");
  }
  
  setupMapEventHandlers() {
    if (!this.map) return;
    
    // Add event handlers to clear background trails when map moves
    this.map.on('movestart', () => {
      this.scheduleClearBackground();
      this.setMoving(true, false); // moving but not zooming
    });
    
    this.map.on('zoomstart', () => {
      this.scheduleClearBackground();
      this.setMoving(true, true); // moving and zooming
    });
    
    this.map.on('moveend', () => {
      this.setMoving(false, false);
    });
    
    this.map.on('zoomend', () => {
      this.setMoving(false, false);
    });
    
    // Store initial view state
    this.lastViewState = {
      center: this.map.getCenter(),
      zoom: this.map.getZoom(),
      bearing: this.map.getBearing(),
      pitch: this.map.getPitch()
    };
  }
  
  scheduleClearBackground() {
    // Clear any existing timeout
    if (this.clearBackgroundTimeout) {
      clearTimeout(this.clearBackgroundTimeout);
    }
    
    // Clear background immediately when movement starts
    if (this.windGL) {
      this.windGL.clearBackground();
    }
  }
  
  setMoving(moving: boolean, zooming: boolean = false) {
    this.isMoving = moving;
    this.isZooming = zooming;
    
    if (moving) {
      // Clear any existing timeout
      if (this.movingTimeout) {
        clearTimeout(this.movingTimeout);
        this.movingTimeout = null;
      }
    } else {
      // Set a timeout to stop moving state after a short delay
      this.movingTimeout = window.setTimeout(() => {
        this.isMoving = false;
        this.isZooming = false;
      }, 500);
    }
  }
  
  hasViewStateChanged(): boolean {
    if (!this.lastViewState || !this.map) return false;
    
    const current = {
      center: this.map.getCenter(),
      zoom: this.map.getZoom(),
      bearing: this.map.getBearing(),
      pitch: this.map.getPitch()
    };
    
    const threshold = 0.001; // Small threshold to avoid constant resets
    
    return (
      Math.abs(current.center.lng - this.lastViewState.center.lng) > threshold ||
      Math.abs(current.center.lat - this.lastViewState.center.lat) > threshold ||
      Math.abs(current.zoom - this.lastViewState.zoom) > 0.1 ||
      Math.abs(current.bearing - this.lastViewState.bearing) > 1 ||
      Math.abs(current.pitch - this.lastViewState.pitch) > 1
    );
  }
  
  async loadWindData() {
    try {
      // Fetch wind data JSON
      const response = await fetch('/src/components/data/current_data.json');
      const windData = await response.json();
      
      // Create and load wind image
      const windImage = new Image();
      windImage.crossOrigin = 'anonymous';
      
      windImage.onload = () => {
        windData.image = windImage;
        this.windGL.windData = windData;
        this.windGL.windTexture = this.createTexture(this.windGL.gl, this.windGL.gl.LINEAR, windData.image);
        console.log('Wind data loaded successfully');
      };
      
      windImage.onerror = () => {
        console.error('Failed to load wind image');
      };
      
      windImage.src = '/src/components/data/current_data.png';
      
    } catch (error) {
      console.error('Failed to load wind data:', error);
    }
  }
  
  createTexture(gl: WebGLRenderingContext | WebGL2RenderingContext, filter: number, data: any) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    if (data instanceof Uint8Array) {
      // Handle Uint8Array data (not used for images)
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, modelViewProjectionMatrix: Float32Array) {
    if (!this.windGL) return;

    // Store current GL state
    const currentProgram = gl.getParameter(gl.CURRENT_PROGRAM);
    const currentViewport = gl.getParameter(gl.VIEWPORT);
    const currentBlend = gl.getParameter(gl.BLEND);
    const currentBlendSrcRgb = gl.getParameter(gl.BLEND_SRC_RGB);
    const currentBlendDstRgb = gl.getParameter(gl.BLEND_DST_RGB);
    
    // Calculate and set viewport bounds for particle spawning
    if (this.map) {
      const bounds = this.map.getBounds();
      const viewportBounds = [
        bounds.getWest(),  // min_lng
        bounds.getSouth(), // min_lat
        bounds.getEast(),  // max_lng
        bounds.getNorth()  // max_lat
      ];
      
      this.windGL.setViewportBounds(viewportBounds);
      
      // Calculate speed factor based on zoom level (viewport size)
      // Use longitude range since it's linear even in Web Mercator
      const lngRange = Math.abs(bounds.getEast() - bounds.getWest());
      const baseLngRange = 360; // Full world longitude range
      const speedScaleFactor = lngRange / baseLngRange;
      
      // Apply speed scaling (clamp between reasonable bounds)
      this.windGL.speedFactor = Math.min(Math.max(0.1 * speedScaleFactor, 0.05), 2.0);
      
      // Set drop rate based on interaction type
      if (this.isZooming) {
        this.windGL.dropRate = 0.1; // Very high drop rate during zoom
      } else if (this.isMoving) {
        this.windGL.dropRate = 0.05; // Moderate drop rate during pan
      } else {
        this.windGL.dropRate = 0.002; // Normal drop rate
      }
    }
    
    // WindGL works in screen space, not map projection space
    // It renders to the full canvas viewport
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    
    // Always render particles with proper map projection matrix
    // Particles will now automatically transform to correct screen positions
    this.windGL.draw(modelViewProjectionMatrix);
    
    // Update last view state for tracking changes
    if (this.map) {
      this.lastViewState = {
        center: this.map.getCenter(),
        zoom: this.map.getZoom(),
        bearing: this.map.getBearing(),
        pitch: this.map.getPitch()
      };
    }
    
    // Restore GL state
    gl.useProgram(currentProgram);
    gl.viewport(currentViewport[0], currentViewport[1], currentViewport[2], currentViewport[3]);
    
    // Restore blend state
    if (currentBlend) {
      gl.enable(gl.BLEND);
      gl.blendFunc(currentBlendSrcRgb, currentBlendDstRgb);
    } else {
      gl.disable(gl.BLEND);
    }
    
    // Continue animation
    this.map.triggerRepaint();
  }

  onRemove() {
    // Cleanup when layer is removed
    if (this.clearBackgroundTimeout) {
      clearTimeout(this.clearBackgroundTimeout);
      this.clearBackgroundTimeout = null;
    }
    
    // Remove map event listeners
    if (this.map) {
      this.map.off('movestart');
      this.map.off('zoomstart');
    }
    
    if (this.windGL) {
      // WindGL doesn't have explicit cleanup, but we can null the reference
      this.windGL = null;
    }
    
    this.map = null;
    this.lastViewState = null;
  }
  
  resize() {
    // Handle canvas resize
    if (this.windGL) {
      this.windGL.resize();
      // Particles will automatically be positioned correctly with the new viewport
    }
  }
}

const WorldMapWindGL: React.FC = () => {
  const mapRef = useRef();
  
  const preprocessCurrentImage = async (imageUrl: string, metadata: any): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        
        canvas.width = img.width;
        canvas.height = img.height;
        
        // Draw original image
        ctx.drawImage(img, 0, 0);
        
        // Get image data for pixel manipulation
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Create a new array for the flipped and processed image
        const processedData = new Uint8ClampedArray(data.length);
        
        // Process and flip each pixel
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const srcIdx = (y * canvas.width + x) * 4;
            const dstIdx = ((canvas.height - 1 - y) * canvas.width + x) * 4; // Flip vertically
            
            const redValue = data[srcIdx];     // u component (0-255)
            const greenValue = data[srcIdx + 1]; // v component (0-255)
            
            // Convert back to original u,v values using metadata
            const u = (redValue / 255.0) * (metadata.uMax - metadata.uMin) + metadata.uMin;
            const v = (greenValue / 255.0) * (metadata.vMax - metadata.vMin) + metadata.vMin;
            
            // Calculate magnitude: sqrt(u² + v²)
            const magnitude = Math.sqrt(u * u + v * v);
            
            // Find the max possible magnitude for normalization
            const maxMagnitude = Math.sqrt(
              Math.max(Math.abs(metadata.uMin), Math.abs(metadata.uMax)) ** 2 +
              Math.max(Math.abs(metadata.vMin), Math.abs(metadata.vMax)) ** 2
            );
            
            // Normalize magnitude to 0-255 and set as red value
            const normalizedMagnitude = Math.min(255, Math.floor((magnitude / maxMagnitude) * 255));
            
            processedData[dstIdx] = normalizedMagnitude;     // R = magnitude
            processedData[dstIdx + 1] = 0;                   // G = 0
            processedData[dstIdx + 2] = 0;                   // B = 0
            processedData[dstIdx + 3] = data[srcIdx + 3];    // A = keep original alpha
          }
        }
        
        // Apply processed and flipped data
        const processedImageData = new ImageData(processedData, canvas.width, canvas.height);
        ctx.putImageData(processedImageData, 0, 0);
        
        // Return processed image as data URL
        resolve(canvas.toDataURL());
      };
      img.src = imageUrl;
    });
  };

  const handleMapLoad = async () => {
    const map = mapRef.current?.getMap();
    if (map) {
      // Load current data metadata
      try {
        const response = await fetch('/src/components/data/current_data.json');
        const metadata = await response.json();
        
        // Preprocess the image to show magnitude in red channel
        const processedImageUrl = await preprocessCurrentImage('/src/components/data/current_data.png', metadata);
        
        // Calculate bounds from metadata
        const minLng = metadata.minLong;
        const minLat = metadata.minLat;
        const maxLng = minLng + (metadata.width * metadata.longPerPixel);
        const maxLat = minLat + (metadata.height * metadata.latPerPixel);
        
        // Add raster source for current data (using processed image)
        map.addSource('current-data', {
          type: 'image',
          url: processedImageUrl, // Use processed image
          coordinates: [
            [minLng, maxLat], // top left
            [maxLng, maxLat], // top right
            [maxLng, minLat], // bottom right
            [minLng, minLat]  // bottom left
          ]
        });
        
        // Add raster layer
        map.addLayer({
          id: 'current-data-layer',
          type: 'raster',
          source: 'current-data',
          paint: {
            'raster-opacity': 0.6, // Make it semi-transparent
            'raster-fade-duration': 300
          }
        });
        
      } catch (error) {
        console.error('Failed to load current data metadata:', error);
      }
      
      // Add WindGL layer on top (this will use the original image)
      map.addLayer(new WindGLLayer());
    }
  };

  const handleResize = () => {
    const map = mapRef.current?.getMap();
    if (map) {
      // Get the WindGL layer and call resize
      const layers = map.getStyle().layers;
      const windLayer = layers?.find((layer: any) => layer.id === 'wind-layer');
      if (windLayer && (windLayer as any).resize) {
        (windLayer as any).resize();
      }
      map.triggerRepaint();
    }
  };

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: -70,
          latitude: 47,
          zoom: 7
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
        onLoad={handleMapLoad}
        onResize={handleResize}
        renderWorldCopies={false}
      >
       
      </Map>
    </div>
  );
};

export default WorldMapWindGL;