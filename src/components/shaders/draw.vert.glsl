precision mediump float;

attribute float a_index;

uniform sampler2D u_particles;
uniform float u_particles_res;
uniform mat4 u_matrix;
uniform vec2 u_wind_min;
uniform vec2 u_wind_max;
uniform vec4 u_viewport_normalized_bounds;

varying vec2 v_particle_pos;

void main() {
    vec4 color = texture2D(u_particles, vec2(
        fract(a_index / u_particles_res),
        floor(a_index / u_particles_res) / u_particles_res));

    // decode current particle position from the pixel's RGBA value
    v_particle_pos = vec2(
        color.r / 255.0 + color.b,
        color.g / 255.0 + color.a);

    // Use pre-calculated normalized bounds from JavaScript
    vec2 pos = vec2(
        mix(u_viewport_normalized_bounds.x, u_viewport_normalized_bounds.z, v_particle_pos.x), 
        mix(u_viewport_normalized_bounds.y, u_viewport_normalized_bounds.w, v_particle_pos.y));

    // v_particle_pos is already in normalized coordinates (0-1), it must be scaled to the viewbound
    
    gl_PointSize = 2.0;
    gl_Position = u_matrix * vec4(pos, 0.0, 1.0);
}
