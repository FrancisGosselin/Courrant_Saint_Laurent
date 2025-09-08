precision highp float;

uniform sampler2D u_particles;
uniform sampler2D u_wind;
uniform vec2 u_wind_res;
uniform vec2 u_wind_min;
uniform vec2 u_wind_max;
uniform float u_rand_seed;
uniform float u_speed_factor;
uniform float u_drop_rate;
uniform float u_drop_rate_bump;
uniform vec4 u_viewport_bounds; // x: min_lng, y: min_lat, z: max_lng, w: max_lat
uniform vec4 u_data_bounds; // x: minLong, y: minLat, z: longPerPixel, w: latPerPixel
uniform vec4 u_viewport_normalized_bounds; // x: min_x, y: min_y, z: max_x, w: max_y

varying vec2 v_tex_pos;

// pseudo-random generator
const vec3 rand_constants = vec3(12.9898, 78.233, 4375.85453);
float rand(const vec2 co) {
    float t = dot(rand_constants.xy, co);
    return fract(sin(t) * (rand_constants.z + t));
}

// Convert normalized Y coordinate (0-1) back to latitude (-90 to 90) using inverse Web Mercator
float yToLatitude(float y) {
    // Inverse Web Mercator transformation
    float mercatorY = (0.5 - y) * 2.0 * 3.14159; // Convert 0-1 to mercator Y range
    float lat_rad = 2.0 * atan(exp(mercatorY)) - 3.14159/2.0; // Inverse mercator formula
    return degrees(lat_rad); // Convert radians to degrees
}

// Convert longitude and latitude to normalized coordinates (0-1) using Web Mercator
vec2 latlong_coord_to_canvas_coord(float lng, float lat) {
    // Convert longitude: -180 to 180 -> 0 to 1 (linear)
    float x = (lng + 180.0) / 360.0;
    
    // Convert latitude using Web Mercator transformation
    float lat_rad = radians(lat);
    float y = 0.5 - log(tan(3.14159/4.0 + lat_rad/2.0)) / (2.0 * 3.14159);
    
    return vec2(x, y);
}

// Scale normalized coordinates (0-1) to canvas coordinates using viewport bounds
vec2 to_canvas_coord(vec2 normalized_coord) {
    return vec2(
        mix(u_viewport_normalized_bounds.x, u_viewport_normalized_bounds.z, normalized_coord.x), // min_x to max_x
        mix(u_viewport_normalized_bounds.y, u_viewport_normalized_bounds.w, normalized_coord.y)  // min_y to max_y
    );
}

// current speed lookup; returns normalized velocity (0-1 range) before scaling
vec2 lookup_wind_normalized(const vec2 uv) {

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
    
    // Check bounds. It assume 0.0 is contained within u_wind_min and u_wind_max
    if (pixelX < 0.0 || pixelX >= u_wind_res.x || pixelY < 0.0 || pixelY >= u_wind_res.y) {
        return vec2((0. - u_wind_min) / (u_wind_max - u_wind_min)); // No current data outside bounds
    }
    
    vec2 tex_coord = vec2(pixelX , pixelY );
    
    // Return the normalized texture values (0-1 range) directly, the result will be scaled back to u_wind_min and u_wind_max in the updatePosition
    vec2 velocity = texture2D(u_wind, tex_coord).rg;

    return velocity;
}

void main() {
    vec4 color = texture2D(u_particles, v_tex_pos);
    vec2 pos = vec2(
        color.r / 255.0 + color.b,
        color.g / 255.0 + color.a); // decode particle position from pixel RGBA

    vec2 velocity_normalized = lookup_wind_normalized(pos);

    // encode the normalized velocity vector into RGBA - using same encoding pattern as position
    gl_FragColor = vec4(
        fract(velocity_normalized * 255.0),
        floor(velocity_normalized * 255.0) / 255.0);
}