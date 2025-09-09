precision mediump float;

attribute float a_index;

uniform sampler2D u_particles;
uniform sampler2D u_wind;
uniform float u_particles_res;
uniform vec2 u_wind_res;
uniform mat4 u_matrix;
uniform vec2 u_wind_min;
uniform vec2 u_wind_max;
uniform vec4 u_viewport_normalized_bounds;
uniform vec4 u_data_bounds; // x: minLong, y: minLat, z: longPerPixel, w: latPerPixel

varying vec2 v_particle_pos;
varying float v_speed_magnitude;
const float PI = 3.1415926535897932384626433832795;

// Convert normalized Y coordinate (0-1) back to latitude (-90 to 90) using inverse Web Mercator
float yToLatitude(float y) {
    // Inverse Web Mercator transformation
    float mercatorY = (0.5 - y) * 2.0 * PI; // Convert 0-1 to mercator Y range
    float lat_rad = 2.0 * atan(exp(mercatorY)) - PI/2.0; // Inverse mercator formula
    return degrees(lat_rad); // Convert radians to degrees
}

// Convert longitude and latitude to normalized coordinates (0-1) using Web Mercator
vec2 latlong_coord_to_canvas_coord(float lng, float lat) {
    // Convert longitude: -180 to 180 -> 0 to 1 (linear)
    float x = (lng + 180.0) / 360.0;
    
    // Convert latitude using Web Mercator transformation
    float lat_rad = radians(lat);
    float y = 0.5 - log(tan(PI/4.0 + lat_rad/2.0)) / (2.0 * PI);
    
    return vec2(x, y);
}

// Scale normalized coordinates (0-1) to canvas coordinates using viewport bounds
vec2 to_canvas_coord(vec2 normalized_coord) {
    return vec2(
        mix(u_viewport_normalized_bounds.x, u_viewport_normalized_bounds.z, normalized_coord.x), // min_x to max_x
        mix(u_viewport_normalized_bounds.y, u_viewport_normalized_bounds.w, normalized_coord.y)  // min_y to max_y
    );
}

// current speed lookup
vec2 lookup_wind(const vec2 uv) {
    // Convert longitude (linear) and latitude (Web Mercator inverse) to geographic coordinates
    float lng = uv.x * 360.0 - 180.0;  // 0-1 -> -180 to 180
    float lat = yToLatitude(uv.y);     // 0-1 -> -90 to 90 using inverse Web Mercator
    
    // Get data bounds
    float minLng = u_data_bounds.x;
    float minLat = u_data_bounds.y;
    float lngPerPixel = u_data_bounds.z;
    float latPerPixel = u_data_bounds.w;
    float maxLng = minLng + lngPerPixel*u_wind_res.x;
    float maxLat = minLat + latPerPixel*u_wind_res.y;

    vec2 minCoords = latlong_coord_to_canvas_coord(minLng, minLat);
    vec2 maxCoords = latlong_coord_to_canvas_coord(maxLng, maxLat);
    vec2 particuleCanvasCoord = to_canvas_coord(uv);

    // Calculate which pixel corresponds to this lat/lng
    float pixelX = ( particuleCanvasCoord.x - minCoords.x) / (maxCoords.x - minCoords.x);
    float pixelY = ( particuleCanvasCoord.y - minCoords.y) / (maxCoords.y - minCoords.y);
    
    // Check bounds
    if (pixelX < 0.0 || pixelX >= u_wind_res.x || pixelY < 0.0 || pixelY >= u_wind_res.y) {
        return vec2(0.0, 0.0); // No current data outside bounds
    }
    
    vec2 tex_coord = vec2(pixelX , pixelY );
    
    vec2 velocity = texture2D(u_wind, tex_coord).rg;
    // Reverse min_max scaling operation
    return mix(u_wind_min, u_wind_max, velocity);
}

void main() {
    vec4 color = texture2D(u_particles, vec2(
        fract(a_index / u_particles_res),
        floor(a_index / u_particles_res) / u_particles_res));

    // decode current particle position from the pixel's RGBA value
    v_particle_pos = vec2(
        color.r / 255.0 + color.b,
        color.g / 255.0 + color.a);

    // Look up wind velocity at particle position
    vec2 velocity = lookup_wind(v_particle_pos);
    v_speed_magnitude = length(velocity);

    // Use pre-calculated normalized bounds from JavaScript
    vec2 pos = vec2(
        mix(u_viewport_normalized_bounds.x, u_viewport_normalized_bounds.z, v_particle_pos.x), 
        mix(u_viewport_normalized_bounds.y, u_viewport_normalized_bounds.w, v_particle_pos.y));

    // v_particle_pos is already in normalized coordinates (0-1), it must be scaled to the viewbound
    
    gl_PointSize = 2.0;
    gl_Position = u_matrix * vec4(pos, 0.0, 1.0);
}
