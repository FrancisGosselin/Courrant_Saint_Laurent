precision highp float;

uniform sampler2D u_particles;
uniform sampler2D u_particle_speed;
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

void main() {
    vec4 color = texture2D(u_particles, v_tex_pos);
    vec2 pos = vec2(
        color.r / 255.0 + color.b,
        color.g / 255.0 + color.a); // decode particle position from pixel RGBA

    // Decode normalized velocity from speed texture
    vec4 speed_color = texture2D(u_particle_speed, v_tex_pos);
    vec2 velocity_normalized = vec2(
        speed_color.r / 255.0 + speed_color.b,
        speed_color.g / 255.0 + speed_color.a); // decode normalized velocity vector from pixel RGBA


    vec2 velocity = mix(u_wind_min, u_wind_max, velocity_normalized);


    // Apply scaling to get actual velocity
    // vec2 velocity = mix(u_wind_min, u_wind_max, velocity_normalized);

    // Calculate speed_t for drop rate calculation

    vec2 offset = vec2(velocity.x, -velocity.y) * 0.01 * u_speed_factor;
    
    float speed_t = length(velocity) / length(u_wind_max);

    // update particle position, wrapping around the date line
    pos = fract(1.0 + pos + offset);

    // a random seed to use for the particle drop
    vec2 seed = (pos + v_tex_pos) * u_rand_seed;

    // drop rate is a chance a particle will restart at random position, to avoid degeneration
    float drop_rate = u_drop_rate + speed_t * u_drop_rate_bump;
    float drop = step(1.0 - drop_rate, rand(seed));

    vec2 random_pos = vec2(rand(seed + 1.3), rand(seed + 2.1));
    pos = mix(pos, random_pos, drop);

    // encode the new particle position back into RGBA
    gl_FragColor = vec4(
        fract(pos * 255.0),
        floor(pos * 255.0) / 255.0);
}