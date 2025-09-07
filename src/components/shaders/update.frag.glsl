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

// current speed lookup; use manual bilinear filtering based on 4 adjacent pixels for smooth interpolation
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
    
    // Bilinear filtering
    // vec2 px = 1.0 / u_wind_res;
    // vec2 vc = (floor(tex_coord * u_wind_res)) * px;
    // vec2 f = fract(tex_coord * u_wind_res);
    // vec2 tl = texture2D(u_wind, vc).rg;
    // vec2 tr = texture2D(u_wind, vc + vec2(px.x, 0)).rg;
    // vec2 bl = texture2D(u_wind, vc + vec2(0, px.y)).rg;
    // vec2 br = texture2D(u_wind, vc + px).rg;
    // vec2 velocity = mix(mix(tl, tr, f.x), mix(bl, br, f.x), f.y);

    vec2 velocity = texture2D(u_wind, tex_coord).rg;
    // Reverse min_max scaling operation
    return mix(u_wind_min, u_wind_max, velocity);
}

void main() {
    vec4 color = texture2D(u_particles, v_tex_pos);
    vec2 pos = vec2(
        color.r / 255.0 + color.b,
        color.g / 255.0 + color.a); // decode particle position from pixel RGBA


    vec2 velocity = lookup_wind(pos);
    float speed_t = length(velocity) / length(u_wind_max);

    // take EPSG:4236 distortion into account for calculating where the particle moved
    float distortion = cos(radians(pos.y * 180.0 - 90.0));
    vec2 offset = vec2(velocity.x / distortion, -velocity.y) * 0.0001 * u_speed_factor;

    // update particle position, wrapping around the date line
    pos = fract(1.0 + pos + offset);

    // a random seed to use for the particle drop
    vec2 seed = (pos + v_tex_pos) * u_rand_seed;

    // drop rate is a chance a particle will restart at random position, to avoid degeneration
    float drop_rate = u_drop_rate + speed_t * u_drop_rate_bump;
    float drop = step(1.0 - drop_rate, rand(seed));


    vec2 random_pos =  vec2(rand(seed + 1.3), rand(seed + 2.1));
    // vec2 random_pos = vec2(
    //     mix(min_x, max_x, rand(seed + 1.3)),
    //     mix(min_y, max_y, rand(seed + 2.1)));
    pos = mix(pos, random_pos, drop);

    // encode the new particle position back into RGBA
    gl_FragColor = vec4(
        fract(pos * 255.0),
        floor(pos * 255.0) / 255.0);
}
