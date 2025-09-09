interface ColorStop {
  position: number;
  r: number;
  g: number;
  b: number;
}

interface Color {
  r: number;
  g: number;
  b: number;
}

interface WindMetadata {
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
}

export default class ImageProcessor {
  private colorStops: ColorStop[] = [
    { position: 0.0,  r: 0,   g: 0,   b: 0 },     // Black
    { position: 0.25, r: 0,   g: 0,   b: 255 },   // Blue
    { position: 0.5,  r: 0,   g: 255, b: 0 },     // Green
    { position: 0.75, r: 255, g: 165, b: 0 },     // Orange
    { position: 1.0,  r: 139, g: 0,   b: 0 }      // Dark Red
  ];

  /**
   * Get color based on normalized magnitude using interpolation
   */
  private getMagnitudeColor(normalizedMagnitude: number): Color {
    // Find the two color stops to interpolate between
    let lowerStop = this.colorStops[0];
    let upperStop = this.colorStops[this.colorStops.length - 1];
    
    for (let i = 0; i < this.colorStops.length - 1; i++) {
      if (normalizedMagnitude >= this.colorStops[i].position && normalizedMagnitude <= this.colorStops[i + 1].position) {
        lowerStop = this.colorStops[i];
        upperStop = this.colorStops[i + 1];
        break;
      }
    }
    
    // Calculate interpolation factor
    const range = upperStop.position - lowerStop.position;
    const factor = range === 0 ? 0 : (normalizedMagnitude - lowerStop.position) / range;
    
    // Interpolate RGB values
    const r = Math.floor(lowerStop.r + (upperStop.r - lowerStop.r) * factor);
    const g = Math.floor(lowerStop.g + (upperStop.g - lowerStop.g) * factor);
    const b = Math.floor(lowerStop.b + (upperStop.b - lowerStop.b) * factor);
    
    return { r, g, b };
  }

  /**
   * Process current image to show magnitude-based color visualization
   */
  async preprocessCurrentImage(imageUrl: string, metadata: WindMetadata): Promise<string> {
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
        
        // Calculate maximum possible magnitude for normalization
        const maxMagnitude = Math.sqrt(
          Math.max(Math.abs(metadata.uMin), Math.abs(metadata.uMax)) ** 2 +
          Math.max(Math.abs(metadata.vMin), Math.abs(metadata.vMax)) ** 2
        );
        
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
            
            // Normalize magnitude to 0-1 range
            const normalizedMagnitude = Math.min(1, magnitude / maxMagnitude);
            
            // Get color based on magnitude using interpolation
            const color = this.getMagnitudeColor(normalizedMagnitude);
            
            processedData[dstIdx] = color.r;                 // R
            processedData[dstIdx + 1] = color.g;             // G  
            processedData[dstIdx + 2] = color.b;             // B
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
  }

  /**
   * Update color stops for magnitude visualization
   */
  setColorStops(colorStops: ColorStop[]): void {
    this.colorStops = colorStops;
  }

  /**
   * Get current color stops
   */
  getColorStops(): ColorStop[] {
    return [...this.colorStops];
  }
}