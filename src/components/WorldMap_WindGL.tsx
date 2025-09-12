import React, { useRef, useState, useCallback } from 'react';
import {Map, Marker} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import WindGL from './index.js';
import ImageProcessor from './ImageProcessor';

class WindGLLayer {
  id = 'wind-layer';
  type = 'custom';
  renderingMode = '2d';
  windGL: WindGL | null = null;
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
    this.windGL.dropRate = 0.005; // Moderate particle respawn
    this.windGL.dropRateBump = 0.008; // Balanced speed-based respawn rate
    
    // Configure particle culling parameters for dense areas
    this.windGL.compactMargin = 0.1; // margin for sampling surrounding wind
    this.windGL.compactThreshold = 0.05; // threshold for determining windy areas  
    this.windGL.dropCompactedRate = 0.9; // 70% chance to kill particles in windy areas
    
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
      this.isMoving = true;
      this.scheduleClearBackground();
      this.startMoving(); // moving but not zooming
    });
    
    this.map.on('zoomstart', () => {
      this.isZooming = true;
      this.scheduleClearBackground();
      this.startMoving(); // moving and zooming
    });
    
    this.map.on('moveend', () => {
      this.isMoving = false;
      this.stopMoving();
    });
    
    this.map.on('zoomend', () => {
      this.isZooming = false;
      this.stopMoving();
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
  
  startMoving() {

    // Clear any existing timeout
    if (this.movingTimeout) {
      clearTimeout(this.movingTimeout);
      this.movingTimeout = null;
    }
  }

  stopMoving() {

    if(!this.isMoving && !this.isZooming) {
      this.movingTimeout = window.setTimeout(() => {
        this.resetViewpostBounds();
      }, 1);
    }

  }

  resetViewpostBounds(){
    const bounds = this.map.getBounds();
    const viewportBounds = [
      bounds.getWest(),  // min_lng
      bounds.getSouth(), // min_lat
      bounds.getEast(),  // max_lng
      bounds.getNorth()  // max_lat
    ];
    
    this.windGL.setViewportBounds(viewportBounds);
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
  
  async loadWindData(dataIndex: number = 0) {
    try {
      // Fetch wind data JSON
      const response = await fetch(`/Courant_Saint_Laurent/data/current_data_${dataIndex}.json`);
      const windData = await response.json();
      
      // Create and load wind image
      const windImage = new Image();
      windImage.crossOrigin = 'anonymous';
      
      windImage.onload = () => {
        windData.image = windImage;
        this.windGL.windData = windData;
        this.windGL.windTexture = this.createTexture(this.windGL.gl, this.windGL.gl.LINEAR, windData.image);
        console.log(`Wind data ${dataIndex} loaded successfully`);
        this.stopMoving();
      };
      
      windImage.onerror = () => {
        console.error(`Failed to load wind image ${dataIndex}`);
      };
      
      windImage.src = `/Courant_Saint_Laurent/data/current_data_${dataIndex}.png`;
      
    } catch (error) {
      console.error(`Failed to load wind data ${dataIndex}:`, error);
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
      
      // Control trail rendering based on map movement state
      this.windGL.enableTrails = !this.isMoving && !this.isZooming;
      
      // Calculate speed factor based on zoom level (viewport size)
      // Use longitude range since it's linear even in Web Mercator
      const lngRange = Math.abs(bounds.getEast() - bounds.getWest());
      const baseLngRange = 360; // Full world longitude range
      const speedScaleFactor = lngRange / baseLngRange;
      
      // Apply speed scaling (clamp between reasonable bounds)
      this.windGL.speedFactor = Math.min(Math.max(0.1 * speedScaleFactor, 0.05), 2.0);
      
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
      this.windGL.resetParticles();
      this.resetViewpostBounds();
      // Particles will automatically be positioned correctly with the new viewport
    }
  }
}

const WorldMapWindGL: React.FC = () => {
  const mapRef = useRef<any>();
  const imageProcessor = new ImageProcessor();
  const [dataIndex, setDataIndex] = useState<number>(0);
  const windLayerRef = useRef<WindGLLayer | null>(null);

  const loadDataForIndex = useCallback(async (index: number) => {
    const map = mapRef.current?.getMap();
    if (map) {
      // Load current data metadata
      try {
        const response = await fetch(`/Courant_Saint_Laurent/data/current_data_${index}.json`);
        const metadata = await response.json();
        
        // Preprocess the image to show magnitude with color gradient
        const processedImageUrl = await imageProcessor.preprocessCurrentImage(`/Courant_Saint_Laurent/data/current_data_${index}.png`, metadata);
        
        // Calculate bounds from metadata
        const minLng = metadata.minLong;
        const minLat = metadata.minLat;
        const maxLng = metadata.maxLong;
        const maxLat = metadata.maxLat;
        
        // Update or add raster source for current data (using processed image)
        if (map.getSource('current-data')) {
          (map.getSource('current-data') as any).updateImage({
            url: processedImageUrl,
            coordinates: [
              [minLng, maxLat], // top left
              [maxLng, maxLat], // top right
              [maxLng, minLat], // bottom right
              [minLng, minLat]  // bottom left
            ]
          });
        } else {
          map.addSource('current-data', {
            type: 'image',
            url: processedImageUrl,
            coordinates: [
              [minLng, maxLat], // top left
              [maxLng, maxLat], // top right
              [maxLng, minLat], // bottom right
              [minLng, minLat]  // bottom left
            ]
          });
        }
        
        // Add raster layer if it doesn't exist
        if (!map.getLayer('current-data-layer')) {
          map.addLayer({
            id: 'current-data-layer',
            type: 'raster',
            source: 'current-data',
            paint: {
              'raster-opacity': 0.6,
              'raster-fade-duration': 300
            }
          });
        }
        
        // Update WindGL layer data
        if (windLayerRef.current) {
          windLayerRef.current.loadWindData(index);
        }
        
      } catch (error) {
        console.error(`Failed to load current data metadata for index ${index}:`, error);
      }
    }
  }, [imageProcessor]);

  const handleMapLoad = async () => {
    const map = mapRef.current?.getMap();
    if (map) {
      // Create and add WindGL layer
      const windLayer = new WindGLLayer();
      windLayerRef.current = windLayer;
      map.addLayer(windLayer);
      
      // Load initial data
      loadDataForIndex(dataIndex);
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

  const handleSliderChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newIndex = parseInt(event.target.value);
    setDataIndex(newIndex);
    loadDataForIndex(newIndex);
  }, [loadDataForIndex]);

  return (
    <div style={{ height: '100vh', width: '100%', position: 'relative' }}>
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: -70,
          latitude: 47.5,
          zoom: 8
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
        onLoad={handleMapLoad}
        onResize={handleResize}
        renderWorldCopies={false}
      >
      </Map>
      <div style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        padding: '20px',
        borderRadius: '12px',
        color: 'white',
        zIndex: 1000,
        minWidth: '280px',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
      }}>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ 
            display: 'block', 
            fontSize: '16px', 
            fontWeight: '600',
            marginBottom: '4px',
            background: 'linear-gradient(135deg, #64B5F6, #42A5F5)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Courants de surface
          </label>
          <div style={{ 
            fontSize: '14px', 
            color: '#94A3B8',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>9 septembre 2025</span>
            <span style={{
              fontSize: '18px',
              fontWeight: '600',
              color: '#F1F5F9'
            }}>
              {dataIndex >= 5 ? `${String(dataIndex - 5).padStart(2, '0')}:00` : `${String(dataIndex + 19).padStart(2, '0')}:00`}
            </span>
          </div>
        </div>
        
        <div style={{ position: 'relative', marginBottom: '16px' }}>
          <input
            type="range"
            min="0"
            max="13"
            value={dataIndex}
            onChange={handleSliderChange}
            style={{
              width: '100%',
              height: '6px',
              background: `linear-gradient(to right, 
                #1E293B 0%, 
                #1E293B ${(dataIndex / 13) * 100}%, 
                #3B82F6 ${(dataIndex / 13) * 100}%, 
                #60A5FA 100%)`,
              borderRadius: '3px',
              outline: 'none',
              cursor: 'pointer',
              appearance: 'none',
              WebkitAppearance: 'none'
            }}
          />
          <style>{`
            input[type="range"]::-webkit-slider-thumb {
              appearance: none;
              width: 20px;
              height: 20px;
              border-radius: 50%;
              background: linear-gradient(135deg, #3B82F6, #1D4ED8);
              cursor: pointer;
              border: 2px solid #F1F5F9;
              box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
              transition: all 0.2s ease;
            }
            input[type="range"]::-webkit-slider-thumb:hover {
              transform: scale(1.1);
              box-shadow: 0 4px 12px rgba(59, 130, 246, 0.6);
            }
            input[type="range"]::-moz-range-thumb {
              width: 20px;
              height: 20px;
              border-radius: 50%;
              background: linear-gradient(135deg, #3B82F6, #1D4ED8);
              cursor: pointer;
              border: 2px solid #F1F5F9;
              box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
              transition: all 0.2s ease;
            }
            input[type="range"]::-moz-range-thumb:hover {
              transform: scale(1.1);
              box-shadow: 0 4px 12px rgba(59, 130, 246, 0.6);
            }
          `}</style>
        </div>
        
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          fontSize: '10px',
          color: '#64748B',
          position: 'relative'
        }}>
          {Array.from({ length: 14 }, (_, i) => (
            <div key={i} style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center',
              opacity: i === dataIndex ? 1 : 0.5,
              transition: 'opacity 0.2s ease'
            }}>
              <div style={{ 
                width: '2px', 
                height: '6px', 
                backgroundColor: i === dataIndex ? '#3B82F6' : '#475569',
                marginBottom: '4px',
                borderRadius: '1px'
              }} />
              <span>{String(i).padStart(2, '0')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WorldMapWindGL;