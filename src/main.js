import "three";
import "three/OrbitControls";
import "three/EffectComposer";
import "three/LuminosityHighPassShader";
import "three/CopyShader";
import "three/SSAARenderPass"
import "three/RenderPass";
import "three/ShaderPass";
import "three/UnrealBloomPass";

import * as dat from 'dat.gui';




// node shaders
const node_vertex_shader = `
#define TEXTURE_DIM     @node_texture_dim

uniform sampler2D start_times;

attribute float instance_id;

varying vec2  instance_uv;
varying float start_time;
varying vec3  node_position;

void main() {
    float texel_offset  = 1.0 / TEXTURE_DIM;
    float center_offset = 1.0 / (2.0 * TEXTURE_DIM);
    vec2 instance_position = vec2(
        center_offset + mod(instance_id, TEXTURE_DIM) * texel_offset,
        center_offset + floor(instance_id / TEXTURE_DIM) * texel_offset 
    );

    start_time = texture2D(start_times, instance_position).a;

    vec4 this_position = instanceMatrix * vec4(position,1.0);
    node_position = this_position.xyz;

    instance_uv = uv;

    gl_Position = projectionMatrix * modelViewMatrix * this_position;
}
`.slice(1);


const node_fragment_shader = `

# define PI                 3.14159265358979323846

#define NODE_LOW            @node_low
#define NODE_HIGH           @node_high
#define NODE_MIX            @node_mix
#define DURATION            @duration
#define SPIKING             @spike_active
#define NODE_SOFT           @node_pulse_soft

#define X   @x
#define Y   @y
#define Z   @z

#define R   @r
#define G   @g
#define B   @b

uniform float time;

varying vec2  instance_uv;
varying float start_time;
varying vec3  node_position;

void main() {
    vec3 norm  = (node_position/vec3(X,Y,Z)) + 1.0;
    vec3 color = vec3(R, G, B);

#if (!SPIKING)
    gl_FragColor = vec4(mix(color, norm, NODE_MIX), NODE_HIGH);

#else
     const float amp        = 0.2;
     const float speedy_boi = 7.0 / 1000.0;

     float active_time = start_time + DURATION;
     float percent = (time-start_time) / DURATION;

     float intensity = step(0.0, start_time);
     intensity  *= smoothstep(0.0, NODE_SOFT, percent);
     intensity  *= 1.0 - smoothstep(1.0-NODE_SOFT, 1.0, percent);
     intensity  *= 1.0 - (amp * ((cos(time * speedy_boi - PI) + 1.0) / 2.0));
     intensity   = intensity*(NODE_HIGH - NODE_LOW) + NODE_LOW;

     gl_FragColor = vec4(mix(color, norm, NODE_MIX), intensity);

#endif

}
`.slice(1);




// edge shaders
const edge_vertex_shader = `
#define TEXTURE_DIM     @edge_texture_dim

uniform sampler2D start_times;
uniform sampler2D flips;

attribute float instance_id;

varying vec2  instance_uv;
varying float start_time;
varying vec3  edge_position;

void main() {
    float texel_offset  = 1.0 / TEXTURE_DIM;
    float center_offset = 1.0 / (2.0 * TEXTURE_DIM);
    vec2 instance_position = vec2(
        center_offset + mod(instance_id, TEXTURE_DIM) * texel_offset,
        center_offset + floor(instance_id / TEXTURE_DIM) * texel_offset 
    );

    start_time = texture2D(start_times, instance_position).a;
  
    float flip = texture2D(flips, instance_position).a;
    flip = clamp(flip, -1.0, 0.0);

    instance_uv.x = uv.x;
    instance_uv.y = abs(uv.y + flip); 

    vec4 this_position = instanceMatrix * vec4(position, 1.0);
    edge_position = this_position.xyz;

    gl_Position = projectionMatrix * modelViewMatrix * this_position;
}
`.slice(1);


const edge_fragment_shader = `

# define PI                 3.14159265358979323846

#define EDGE_LOW            @edge_low
#define EDGE_HIGH           @edge_high
#define EDGE_MIX            @edge_mix
#define DURATION            @duration
#define SPIKING             @spike_active
#define EDGE_PULSE_WIDTH    @edge_pulse_width
#define EDGE_SOFT           @edge_pulse_soft

#define X   @x
#define Y   @y
#define Z   @z

#define R   @r
#define G   @g
#define B   @b

uniform float time;

varying vec2  instance_uv;
varying float start_time;
varying vec3  edge_position;

void main() {
    vec3 norm = (edge_position/vec3(X,Y,Z)) + 1.0;
    vec3 color = vec3(R, G, B);

#if (!SPIKING)
    gl_FragColor = vec4(mix(color, norm, EDGE_MIX), EDGE_HIGH);

#else
    const float amp        = 0.1;
    const float speedy_boi = 9.0 / 1000.0;
    const float half_width = EDGE_PULSE_WIDTH / 2.0;

    float active_time = (time-start_time)/(DURATION);
    
    float wiper = step(0.0, start_time) * active_time * (1.0+(2.0*EDGE_PULSE_WIDTH)) - EDGE_PULSE_WIDTH;

    float LL = clamp(instance_uv.y-half_width-EDGE_SOFT, 0.0, 1.0);
    float LR = instance_uv.y-half_width+EDGE_SOFT;
    
    float RL = instance_uv.y+half_width-EDGE_SOFT;
    float RR = instance_uv.y+half_width+EDGE_SOFT;
    
	float pulse = 0.0;
    pulse += smoothstep(LL, LR, wiper);
    pulse -= smoothstep(RL, RR, wiper);
    pulse *= 1.0 - (amp * ((cos(time * speedy_boi - PI) + 1.0) / 2.0));
    pulse  = pulse*(EDGE_HIGH - EDGE_LOW) + EDGE_LOW;

    gl_FragColor = vec4(mix(color, norm, EDGE_MIX), pulse);

#endif

}
`.slice(1);




function webgl_main() {
    var settings = {
        "animation": {
            "active": true,
            "culling": 0.6,
            "node": {
                "feather": 0.3,
            },
            "edge": {
                "width": 0.185,
                "feather": 0.100,
            },

            "fast": {
                "active": true,
                "setup": 150.0,
                "node": 450.0,
                "edge": 550.0,
            },

            "slow": {
                "active": false,
                "setup": 350.0,
                "node": 3000.0,
                "edge": 5000.0,
            },
        },

        "camera": {
            "fov": 70,
            "y": 0.15,
            "z": 6.00,
            "speed": 0.35,
            "exposure": 0.700,
        },

        "colors": {
            "background": 0x14282e,

            "node": {
                "low": 0.200,
                "high": 1.000,
                "main": 0x00ffff,
                "mix": 0.4,
            },

            "edge": {
                "low": 0.080,
                "high": 0.700,
                "main": 0x007ee6,
                "mix": 0.25,
            },
        },

        "scene": {
            "grid": {
                "subdivisions": 4,
                "spread": 0.8, 
                "range": {
                    "min": 1.3,
                    "max": 1.8,
                }
            },

            "node": {
                "radius": 0.0120,
                "segments": 8,
                "culling": 0.200,
            },

            "edge": {
                "radius": 0.0035,
                "segments": 4,
                "culling": {
                    "coarse": {
                        "active": false,
                        "value": 0.5,
                    },

                    "fine": {
                        "active": true,
                        "value": 0.93,
                    },
                },
            },
        }, 

        "bloom": {
            "active": true,
            "strength": 0.910,
            // "radius": 0.025,
            "radius": 0.7,
            "threshold": 0.315,
            "factor": 2,
        },

        "aa": {
            "active": true,
            "sample_level": 16
        },
    };

    function generate_pallette() {
        settings._pallette_blue = {
            "background": 0x1b2426,

            "node": {
                "low": 0.030,
                "high": 1.000,
                "main": 0x3fffff,
                "mix": 0.1,
            },

            "edge": {
                "low": 0.010,
                "high": 0.920,
                "main": 0x00aee6,
                "mix": 0.1, 
            },
        };

        settings._pallette_orange = {
            "background": 0x1b1b1b,

            "node": {
                "low": 0.060,
                "high": 1.000,
                "main": 0xed5432,
                "mix": 0.12,
            },

            "edge": {
                "low": 0.020,
                "high": 0.900,
                "main": 0xe65200,
                "mix": 0.18,
            },
        };

        settings._pallette_monochrome = {
            "background": 0x1b1b1b,

            "node": {
                "low": 0.060,
                "high": 1.000,
                "main": 0xcacaca,
                "mix": 0.0,
            },

            "edge": {
                "low": 0.020,
                "high": 0.800,
                "main": 0x757575,
                "mix": 0.0,
            },
        };

        settings._pallette_matrix = {
            "background": 0x1b1b1b,

            "node": {
                "low": 0.30,
                "high": 1.000,
                "main": 0x3fff3f,
                "mix": 0.0,
            },

            "edge": {
                "low": 0.020,
                "high": 1.000,
                "main": 0x00ff2d,
                "mix": 0.0,
            },
        };

        settings._pallette_rainbow = {
            "background": 0x1b1b1b,

            "node": {
                "low": 0.1,
                "high": 1.000,
                "main": 0xff0000,
                "mix": 1.0,
            },

            "edge": {
                "low": 0.010,
                "high": 1.000,
                "main": 0xff0000,
                "mix": 1.0,
            },
        };

    }

    var is_mobile = ('ontouchstart' in document.documentElement) && /Mobi/.test(navigator.userAgent);
    console.log("mobile: ", is_mobile);

    if (is_mobile) {
        settings.camera.fov = 50;
    }

    function pick_pallette() {
        let p = Math.random();
        settings.colors = {}
        settings.colors = (p >= 0.00 && p < 0.50) ? settings._pallette_monochrome : settings.colors;
        settings.colors = (p >= 0.50 && p < 0.65) ? settings._pallette_blue       : settings.colors;
        settings.colors = (p >= 0.65 && p < 0.80) ? settings._pallette_orange     : settings.colors;
        settings.colors = (p >= 0.80 && p < 0.95) ? settings._pallette_matrix     : settings.colors;
        settings.colors = (p >= 0.95 && p < 1.00) ? settings._pallette_rainbow    : settings.colors;
    }
    
    generate_pallette();
    pick_pallette();


    // set up intermediates
    var system_init  = false;
    var system_ready = false;

    let geometric_offset = Math.PI/2;

    var instance_matrix             = new THREE.Matrix4();
    var instance_scale_matrix       = new THREE.Matrix4();
    var instance_rotation_matrix    = new THREE.Matrix4();
    var instance_translation_matrix = new THREE.Matrix4();

    var color_clear = new THREE.Color(settings.colors.background);

    if (is_mobile) {
        settings.bloom.active = false;
        settings.aa.active = false;

        //color_clear.multiplyScalar(0.5);

        settings.colors.background = color_clear.getHex();
        settings.colors.node.low *= 0.5;
        settings.colors.edge.low *= 0.5;
        settings.scene.edge.culling.fine.value *= 1.01;
    }
                                      



    // setup scene
    var canvas          = document.querySelector("canvas");
    var color_renderer  = new THREE.WebGLRenderer({canvas: canvas});
    var scene           = new THREE.Scene();
    var camera          = new THREE.PerspectiveCamera(settings.camera.fov, 1.0, 0.001, 1000);
    var controls        = new THREE.OrbitControls(camera, canvas);
    var composer        = new THREE.EffectComposer(color_renderer);

    color_renderer.getContext().canvas.addEventListener("webglcontextlost", function(event) {
        console.log("[Error] WebGL Context lost, re-intializing scene.");
        return can_render();
    });



    // find out if in display mode
    let display_mode_active = (window.location.search.substr(1) === '1');
    if (display_mode_active) {

        var gui_button_box = document.getElementById("interaction-box");
        gui_button_box.style.opacity = 0;

        setInterval(() => {
            pick_pallette(); 

            color_clear.set(settings.colors.background);
            color_renderer.setClearColor(color_clear, 1.0);
            aa_pass.clearColor = color_clear;

            gui_build_shaders();
            gui_set_scene_rebuild();
        }, 30000);
    }



    var n_nodes, n_edges;
    var local_width, local_height, local_ratio;
    var x_range, y_range, z_range;

    var nodes;             
    var node_mesh;             
    var node_data_start_times;
    var node_texture_dim;
    var node_texture_start_times;
    var node_uniform;

    var edge_mesh;
    var edge_data_start_times;
    var edge_data_flips;
    var edge_texture_dim;
    var edge_texture_start_times;
    var edge_texture_flips;
    var edge_uniform;

    var render_pass;
    var bloom_pass;
    var aa_pass;




    function gui_build_shaders(val) {
        node_mesh.material = init_node_material(settings, node_uniform);
        node_mesh.material.needsUpdate = true;

        edge_mesh.material = init_edge_material(settings, edge_uniform);
        edge_mesh.material.needsUpdate = true;
    }

    function gui_set_scene_rebuild(val){
        system_ready = false;
    }


    var gui = new dat.GUI({resizable: false});
    var gf = gui.addFolder("Animation");
        gf.add(settings.animation, "active").onChange((val) => {
            gui_build_shaders();
            init_animation();
        });
        gf.add(settings.animation, "culling", 0.0, 1.0, 0.01);

        var gff = gf.addFolder("Node");
            gff.add(settings.animation.node, "feather", 0.001, 0.3, 0.001).onChange((val) => {
            node_mesh.material = init_node_material(settings, node_uniform);
            node_mesh.material.needsUpdate = true;
        });

        var gff = gf.addFolder("Edge");
            gff.add(settings.animation.edge, "width", 0.0, 1.0, 0.001).onChange((val) => {
                edge_mesh.material = init_edge_material(settings, edge_uniform);
                edge_mesh.material.needsUpdate = true;
            });

            gff.add(settings.animation.edge, "feather", 0.001, 0.5, 0.001).onChange((val) => {
                edge_mesh.material = init_edge_material(settings, edge_uniform);
                edge_mesh.material.needsUpdate = true;
            });

        var gff = gf.addFolder("Fast");
            gff.add(settings.animation.fast, "active").onChange((val) => {
                if (val) {
                    if (settings.animation.slow.active) { 
                        settings.animation.slow.active = false;
                        gui_build_shaders();
                        init_animation();
                    }
                }
            }).listen();

            gff.add(settings.animation.fast, "setup", 100.0, 1000.0, 1.0).onChange((val) => {
                init_animation();
            });
            gff.add(settings.animation.fast, "node", 100.0, 1000.0, 1.0).onChange((val) => {
                gui_build_shaders();
                init_animation();
            });
            gff.add(settings.animation.fast, "edge", 100.0, 1000.0, 1.0).onChange((val) => {
                gui_build_shaders();
                init_animation();
            });

        var gff = gf.addFolder("Slow");
            gff.add(settings.animation.slow, "active").onChange((val) => {
                if (val) {
                    if (settings.animation.fast.active) { 
                        settings.animation.fast.active = false;
                        gui_build_shaders();
                        init_animation();
                    }
                }
            }).listen();
            gff.add(settings.animation.slow, "setup", 500.0, 2000.0, 1.0).onChange((val) => {
                init_animation();
            });
            gff.add(settings.animation.slow, "node", 1000.0, 10000.0, 1.0).onChange((val) => {
                gui_build_shaders();
                init_animation();
            });
            gff.add(settings.animation.slow, "edge", 1000.0, 10000.0, 1.0).onChange((val) => {
                gui_build_shaders();
                init_animation();
            });

    var gf = gui.addFolder("Camera");
        gf.add(settings.camera, "fov", 20, 100, 1.0).onChange((val) => {
            camera.fov = val;
            camera.updateProjectionMatrix();
            controls.update();
        });
        gf.add(settings.camera, "y", -6.0, 6.0, 0.01).onChange((val) => {
            camera.position.setY(val);
            camera.updateProjectionMatrix();
            controls.update();
        });
        gf.add(settings.camera, "z", 0.0, 10.0, 0.01).onChange((val) => {
            camera.position.setZ(val);
            camera.updateProjectionMatrix();
            controls.update();
        });
        gf.add(settings.camera, "speed", 0.0, 10.0, 0.01).onChange((val) => {
            controls.autoRotateSpeed = val;
        });
        gf.add(settings.camera, "exposure", 0.0, 2.0, 0.01).onChange((val) => {
            color_renderer.toneMappingExposure = val;
        });

    var gf = gui.addFolder("Color");
        gf.addColor(settings.colors, "background").onChange((val) => {
            color_clear.set(settings.colors.background);
            color_renderer.setClearColor(color_clear, 1.0);
            aa_pass.clearColor = color_clear;
        });

        var gff = gf.addFolder("Node");
            gff.add(settings.colors.node, "low", 0.0, 1.0, 0.01).onChange((val) => {
                node_mesh.material = init_node_material(settings, node_uniform);
                node_mesh.material.needsUpdate = true;
            });
            gff.add(settings.colors.node, "high", 0.0, 1.0, 0.01).onChange((val) => {
                node_mesh.material = init_node_material(settings, node_uniform);
                node_mesh.material.needsUpdate = true;
            });
            gff.addColor(settings.colors.node, "main").onChange((val) => {
                node_mesh.material = init_node_material(settings, node_uniform);
                node_mesh.material.needsUpdate = true;
            });
            gff.add(settings.colors.node, "mix", 0.0, 1.0, 0.05).onChange((val) => {
                node_mesh.material = init_node_material(settings, node_uniform);
                node_mesh.material.needsUpdate = true;
            });

        var gff = gf.addFolder("Edge");
            gff.add(settings.colors.edge, "low", 0.0, 1.0, 0.01).onChange((val) => {
                edge_mesh.material = init_edge_material(settings, edge_uniform);
                edge_mesh.material.needsUpdate = true;
            });
            gff.add(settings.colors.edge, "high", 0.0, 1.0, 0.01).onChange((val) => {
                edge_mesh.material = init_edge_material(settings, edge_uniform);
                edge_mesh.material.needsUpdate = true;
            });
            gff.addColor(settings.colors.edge, "main").onChange((val) => {
                edge_mesh.material = init_edge_material(settings, edge_uniform);
                edge_mesh.material.needsUpdate = true;
            });
            gff.add(settings.colors.edge, "mix", 0.0, 1.0, 0.05).onChange((val) => {
                edge_mesh.material = init_edge_material(settings, edge_uniform);
                edge_mesh.material.needsUpdate = true;
            });

    var gf = gui.addFolder("Scene");
        var gff = gf.addFolder("Grid");
            gff.add(settings.scene.grid, "spread",   0.0, 1.0, 0.01).onChange(gui_set_scene_rebuild);
            gff.add(settings.scene.grid, "subdivisions", 2, 8, 1.0).onChange(gui_set_scene_rebuild);    
            var gfff = gff.addFolder("Range");
                gfff.add(settings.scene.grid.range, "max", 0.1, 5.0, 0.1).onChange(gui_set_scene_rebuild);    
                gfff.add(settings.scene.grid.range, "min", 0.1, 5.0, 0.1).onChange(gui_set_scene_rebuild);

        var gff = gf.addFolder("Node");
            gff.add(settings.scene.node, "radius",   0.01, 0.3, 0.01).onChange(gui_set_scene_rebuild);
            gff.add(settings.scene.node, "segments",   2,  64,  1.0).onChange(gui_set_scene_rebuild);
            gff.add(settings.scene.node, "culling",  0.0, 1.0, 0.01).onChange(gui_set_scene_rebuild);

        var gff = gf.addFolder("Edge");
            gff.add(settings.scene.edge, "radius",   0.01, 0.1, 0.01).onChange(gui_set_scene_rebuild);
            gff.add(settings.scene.edge, "segments",   2,  64,  1.0).onChange(gui_set_scene_rebuild);

            var gfff = gff.addFolder("Culling");
                var gffff = gfff.addFolder("Coarse");
                    gffff.add(settings.scene.edge.culling.coarse, "active").onChange((val) => {
                        if (val && settings.scene.edge.culling.fine.active) {
                            settings.scene.edge.culling.fine.active = false;
                        }
                        gui_set_scene_rebuild(val);
                    }).listen();
                    gffff.add(settings.scene.edge.culling.coarse, "value",  0.5, 0.9, 0.05).onChange(gui_set_scene_rebuild);
    
                var gffff = gfff.addFolder("Fine");
                    gffff.add(settings.scene.edge.culling.fine, "active").onChange((val) => {
                        if (val && settings.scene.edge.culling.coarse.active) {
                            settings.scene.edge.culling.coarse.active = false;
                        }
                        gui_set_scene_rebuild(val);
                    }).listen();
                    gffff.add(settings.scene.edge.culling.fine, "value",  0.9, 1.0, 0.01).onChange(gui_set_scene_rebuild);

    if (!is_mobile) {
        var gf = gui.addFolder("Bloom");
            gf.add(settings.bloom, "active").onChange((val) => {
                composer = new THREE.EffectComposer(color_renderer);
                composer.setPixelRatio(window.devicePixelRatio);
                composer.setSize(local_width, local_height);
                composer.addPass(render_pass);
                if (settings.aa.active)  composer.addPass(aa_pass);
                if (settings.bloom.active) composer.addPass(bloom_pass);
            });
            
            gf.add(settings.bloom, "strength", 0.0, 2.0, 0.01).onChange((val) => {
                bloom_pass.strength = val;
            });
            
            gf.add(settings.bloom, "radius", 0.0, 1.0, 0.05).onChange((val) => {
                bloom_pass.radius = val;
            });
            
            gf.add(settings.bloom, "threshold", 0.0, 1.5, 0.01).onChange((val) => {
                bloom_pass.threshold = val;
            });

        var gf = gui.addFolder("AntiAlias");
            gf.add(settings.aa, "active").onChange((val) => {
                composer = new THREE.EffectComposer(color_renderer);
                composer.setPixelRatio(window.devicePixelRatio);
                composer.setSize(local_width, local_height);
                composer.addPass(render_pass);
                if (settings.aa.active)  composer.addPass(aa_pass);
                if (settings.bloom.active) composer.addPass(bloom_pass);
            });
            gf.add(settings.aa, "sample_level", {
                "1": 1,
                "2": 2,
                "4": 3,
                "8": 4,
                "16": 5,
                "32": 6,
            }).onChange((val) => {
                aa_pass.sampleLevel = settings.aa.sample_level;
            });
    }



    gui.hide();
   
    var gui_back = document.getElementById("back-button");
    var gui_interact = document.getElementById("interaction-button");
    var gui_button_box = document.getElementById("interaction-box");
    gui_interact.addEventListener("click", () => {
        gui_button_box.style.pointerEvents = "none";

        gui_button_box.style.opacity = 0.0;
        gui_back.style.opacity       = 1.0;
        gui_back.style.pointerEvents = "auto";
        
        gui.show();
        controls.enabled = true;
    });
    gui_back.addEventListener("click", () => {
        gui_button_box.style.pointerEvents = "auto";

        gui_button_box.style.opacity = 1.0;
        gui_back.style.opacity       = 0.0;
        gui_back.style.pointerEvents = "none";
        
        gui.hide();
        controls.enabled = false;
    });


    function init_scene() {
        local_width  = window.screen.availWidth;
        local_height = window.screen.availHeight;
        local_ratio  = local_width / local_height;

        color_renderer.autoClear = false;
        color_renderer.setClearColor(color_clear, 1.0);
        color_renderer.toneMapping = THREE.ACESFilmicToneMapping;
        color_renderer.toneMappingExposure = settings.camera.exposure;
        color_renderer.setPixelRatio(window.devicePixelRatio);
        color_renderer.setSize(local_width, local_height, false);
        color_renderer.setRenderTarget(null);

        camera.aspect = local_ratio;
        if (!is_mobile) {
            camera.position.set(0, settings.camera.y, settings.camera.z);
        } else {
            camera.position.set(0, settings.camera.y, settings.camera.z * 0.5);
        }
        camera.lookAt(0,0,0);

        controls.autoRotate = true;
        controls.autoRotateSpeed = settings.camera.speed;
        controls.enabled = false;

        render_pass = new THREE.RenderPass(scene, camera);

        aa_pass = new THREE.SSAARenderPass(scene, camera);
        aa_pass.sampleLevel = settings.aa.sample_level;
        aa_pass.clearColor  = color_clear;
        aa_pass.clearAlpha  = 1.0;

        bloom_pass = new THREE.UnrealBloomPass(
            new THREE.Vector2( local_width * settings.bloom.factor, local_height * settings.bloom.factor),
            settings.bloom.strength,
            settings.bloom.radius,
            settings.bloom.threshold,
        )

        composer.setPixelRatio(window.devicePixelRatio);
        composer.setSize(local_width, local_height);
        composer.addPass(render_pass);
        if (settings.aa.active)  composer.addPass(aa_pass);
        if (settings.bloom.active) composer.addPass(bloom_pass);
    };


    function init_node_material(settings, uniforms) {
        let to_string = (x) => { return Number(x).toFixed(8) };

        let vertex_shader = node_vertex_shader.slice(0)
            .split("@node_texture_dim").join(to_string(node_texture_dim));

        let fragment_shader = node_fragment_shader.slice(0)
            .split("@x").join(to_string(x_range))
            .split("@y").join(to_string(y_range))
            .split("@z").join(to_string(z_range))
            .split("@b").join(to_string(((settings.colors.node.main & 0x0000ff) >> 0 ) / 255))
            .split("@g").join(to_string(((settings.colors.node.main & 0x00ff00) >> 8 ) / 255))
            .split("@r").join(to_string(((settings.colors.node.main & 0xff0000) >> 16) / 255))
            .split("@node_low").join(to_string(settings.colors.node.low))
            .split("@node_high").join(to_string(settings.colors.node.high))
            .split("@node_mix").join(to_string(settings.colors.node.mix))
            .split("@duration").join( to_string((settings.animation.fast.active) ? settings.animation.fast.node : settings.animation.slow.node ))
            .split("@spike_active").join(settings.animation.active ? "1" : "0")
            .split("@node_pulse_soft").join(to_string(settings.animation.node.feather));

        let node_material = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: vertex_shader,
            fragmentShader: fragment_shader
        });
        node_material.blending = THREE.AdditiveBlending;
        node_material.depthWrite = false;

        return node_material;
    }


    function init_edge_material(settings, uniforms) {
        let to_string = (x) => { return Number(x).toFixed(8) };

        let vertex_shader = edge_vertex_shader.slice(0)
            .split("@edge_texture_dim").join(to_string(edge_texture_dim));

        let fragment_shader = edge_fragment_shader.slice(0)
            .split("@x").join(to_string(x_range))
            .split("@y").join(to_string(y_range))
            .split("@z").join(to_string(z_range))
            .split("@b").join(to_string(((settings.colors.edge.main & 0x0000ff) >> 0 ) / 255))
            .split("@g").join(to_string(((settings.colors.edge.main & 0x00ff00) >> 8 ) / 255))
            .split("@r").join(to_string(((settings.colors.edge.main & 0xff0000) >> 16) / 255))
            .split("@edge_low").join(to_string(settings.colors.edge.low))
            .split("@edge_high").join(to_string(settings.colors.edge.high))
            .split("@edge_mix").join(to_string(settings.colors.edge.mix))
            .split("@duration").join( to_string((settings.animation.fast.active) ? settings.animation.fast.edge : settings.animation.slow.edge ))
            .split("@spike_active").join(settings.animation.active ? "1" : "0")
            .split("@edge_pulse_width").join(to_string(settings.animation.edge.width))
            .split("@edge_pulse_soft").join(to_string(settings.animation.edge.feather));

        let edge_material = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: vertex_shader,
            fragmentShader: fragment_shader
        });
        edge_material.blending = THREE.AdditiveBlending;
        edge_material.depthWrite = false;

        return edge_material;
    }


    function init_system() {
        // nodes -----------------------
        let portrait = local_width < local_height;

        x_range = (!portrait) ? settings.scene.grid.range.max : settings.scene.grid.range.min;
        y_range = (!portrait) ? settings.scene.grid.range.max : settings.scene.grid.range.min;
        z_range = (!portrait) ? settings.scene.grid.range.max : settings.scene.grid.range.min;

        n_nodes = settings.scene.grid.subdivisions * settings.scene.grid.subdivisions * settings.scene.grid.subdivisions;
        n_edges = (n_nodes * (n_nodes-1)) / 2;

        let node_indices = [];
        if (settings.scene.node.culling > 1e-6) {
            for (let it = 0; it < n_nodes; it++) {
                if (Math.random() <= settings.scene.node.culling) continue;
                node_indices.push(it);
            }
            n_nodes = node_indices.length;
        } else {
            node_indices = Array.from({length: n_nodes}, (x,i) => i);
        }

        let node_geometry          = new THREE.SphereGeometry(settings.scene.node.radius, settings.scene.node.segments, settings.scene.node.segments);
        let node_instance_geometry = new THREE.InstancedBufferGeometry().fromGeometry(node_geometry);
        let node_instance_ids      = new THREE.InstancedBufferAttribute(new Float32Array(n_nodes), 1, false);

        node_texture_dim = 1;
        while (n_nodes > node_texture_dim * node_texture_dim) node_texture_dim <<= 1;

        node_data_start_times = new Float32Array(node_texture_dim*node_texture_dim);
        for (let i = 0; i < n_nodes; i++) {
            node_data_start_times[i] = -1.0;
        }

        node_texture_start_times = new THREE.DataTexture(node_data_start_times, node_texture_dim, node_texture_dim, THREE.AlphaFormat, THREE.FloatType);

        node_texture_start_times.needsUpdate      = true;
        node_texture_start_times.matrixAutoUpdate = false;
        node_texture_start_times.minFilter        = THREE.NearestFilter;
        node_texture_start_times.magFilter        = THREE.NearestFilter;

        node_uniform = {
            time:         {type: "f", value: 0.0},
            start_times:  {type: "t", value: node_texture_start_times},
        };

        let node_material = init_node_material(settings, node_uniform);

        nodes = new Array(n_nodes);
        node_mesh = new THREE.InstancedMesh(node_instance_geometry, node_material, n_nodes);
        scene.add(node_mesh);

        let x_portion = (x_range*2) / (settings.scene.grid.subdivisions-1);
        let y_portion = (y_range*2) / (settings.scene.grid.subdivisions-1);
        let z_portion = (z_range*2) / (settings.scene.grid.subdivisions-1);

        for (let it = 0; it < n_nodes; it++) {
            let node_index = node_indices[it];

            let i = node_index % settings.scene.grid.subdivisions;
            let j = Math.floor(node_index / (settings.scene.grid.subdivisions * settings.scene.grid.subdivisions));
            let k = Math.floor(node_index / settings.scene.grid.subdivisions) % settings.scene.grid.subdivisions;

            let x = (x_portion * i) - x_range + (Math.random() * 2 - 1)*settings.scene.grid.spread;
            let y = (y_portion * j) - y_range + (Math.random() * 2 - 1)*settings.scene.grid.spread;
            let z = (z_portion * k) - z_range + (Math.random() * 2 - 1)*settings.scene.grid.spread;

            nodes[it] = {};
            nodes[it]["connections"] = {};
            nodes[it]["position"] = new THREE.Vector3().set(x,y,z);
            instance_translation_matrix.makeTranslation(x, y, z);

            node_mesh.setMatrixAt(it, instance_translation_matrix);
            node_instance_ids.setX(it, it);
        }

        node_instance_geometry.setAttribute("instance_id", node_instance_ids);


        // edges -----------------------
        let edge_culling;
        if (settings.scene.edge.culling.coarse.active) {
            edge_culling = settings.scene.edge.culling.coarse.value;
        } else {
            edge_culling = settings.scene.edge.culling.fine.value;
        }

        let edge_indices = [];
        if (edge_culling > 1e-6) {
            for (let i = 0; i < n_nodes-1; i++) {
                let created = 0;
                for (let j = i+1; j < n_nodes; j++) {
                    if (Math.random() <= edge_culling) continue;
                    edge_indices.push([i,j]);
                    created++;
                }

                if (created == 0) {
                    let benefit = Math.floor(Math.random() * (n_nodes-i-2)) + (i+1);
                    edge_indices.push([i, benefit]);
                }
            }
            n_edges = edge_indices.length;
        } 
        else {
            edge_indices = new Array(n_edges);

            let it = 0;
            for (let i = 0; i < n_nodes-1; i++) {
                for (let j = i+1; j < n_nodes; j++) {
                    edge_indices[it] = [i, j];
                    it++;
                }
            }
        }

        let edge_geometry = new THREE.CylinderGeometry(settings.scene.edge.radius, settings.scene.edge.radius, 1.0, settings.scene.edge.segments, 1, true)
            .rotateX(geometric_offset);

        let edge_instance_geometry = new THREE.InstancedBufferGeometry().fromGeometry(edge_geometry);
        let edge_instance_ids      = new THREE.InstancedBufferAttribute(new Float32Array(n_edges), 1, false);

        edge_texture_dim = 1;
        while (n_edges > edge_texture_dim * edge_texture_dim) edge_texture_dim <<= 1;

        edge_data_start_times = new Float32Array(edge_texture_dim*edge_texture_dim);
        edge_data_flips       = new Float32Array(edge_texture_dim*edge_texture_dim);
        for (let i = 0; i < n_edges; i++) {
            edge_data_start_times[i] = -1.0;
            edge_data_flips[i]       =  0.0;
        }

        edge_texture_start_times = new THREE.DataTexture(edge_data_start_times, edge_texture_dim, edge_texture_dim, THREE.AlphaFormat, THREE.FloatType);
        edge_texture_flips       = new THREE.DataTexture(edge_data_flips,       edge_texture_dim, edge_texture_dim, THREE.AlphaFormat, THREE.FloatType);

        edge_texture_start_times.needsUpdate      = true;
        edge_texture_start_times.matrixAutoUpdate = false;
        edge_texture_start_times.minFilter        = THREE.NearestFilter;
        edge_texture_start_times.magFilter        = THREE.NearestFilter;

        edge_texture_flips.needsUpdate      = true;
        edge_texture_flips.matrixAutoUpdate = false;
        edge_texture_flips.minFilter        = THREE.NearestFilter;
        edge_texture_flips.magFilter        = THREE.NearestFilter;

        edge_uniform = {
            time:        {type: "f", value: 0.0},
            start_times: {type: "t", value: edge_texture_start_times},
            flips:       {type: "t", value: edge_texture_flips},
        }

        let edge_material = init_edge_material(settings, edge_uniform);

        edge_mesh = new THREE.InstancedMesh(edge_instance_geometry, edge_material, n_edges);
        scene.add(edge_mesh);

        for (let it = 0; it < n_edges; it++) {
            let i = edge_indices[it][0];
            let j = edge_indices[it][1];

            let a = nodes[i]["position"];
            let b = nodes[j]["position"];

            // position is midpoint between the 2 nodes
            instance_translation_matrix.makeTranslation(
                (a.x + b.x) / 2, 
                (a.y + b.y) / 2, 
                (a.z + b.z) / 2
            );

            // scale to stretch ends between node positions
            let ab_norm = b.clone().sub(a).normalize();
            let scale   = Math.abs(a.distanceTo(b)) - (2*settings.scene.node.radius) + 1e-4;
            instance_scale_matrix.makeScale(1.0, 1.0, scale);

            // rotation
            instance_rotation_matrix.lookAt(ab_norm, edge_mesh.position, edge_mesh.up);

            // apply
            instance_matrix.identity();
            instance_matrix.premultiply(instance_scale_matrix);
            instance_matrix.premultiply(instance_rotation_matrix);
            instance_matrix.premultiply(instance_translation_matrix);
            edge_mesh.setMatrixAt(it, instance_matrix);
            edge_instance_ids.setX(it, it);

            // directional information
            nodes[i]["connections"][j] = [it,  1]; // A->B
            nodes[j]["connections"][i] = [it, -1]; // B->A
        }

        edge_instance_geometry.setAttribute("instance_id", edge_instance_ids);

    }


    init_scene();
    init_system();
    system_ready = true;

    // animations
    const animation_states = {
        "update": 0,
        "setup":  1,
        "node":   2,
        "edge":   3,
    };

    var animation_timer;
    var animation_state;

    var previous_edges;
    var next_edges;
    var previous_targets;
    var targets;
    var next_targets;

    var t0;
    var t1;
    var dt;
    var t;

    function init_animation() {
        animation_timer   = 0;
        animation_state   = animation_states.setup;

        previous_edges    = {};
        next_edges        = {};
        previous_targets  = [];
        targets           = [];
        next_targets      = [];

        t0 = performance.now();
        t1 = t0;
        dt = 0;
        t  = 0;
    }

    init_animation();




    var animate = function () {
        // build scene when marked for reconstruction
        if(!system_ready) {
            scene.remove(edge_mesh);
            scene.remove(node_mesh);
            init_system();
            scene.add(edge_mesh);
            scene.add(node_mesh);

            init_animation();

            system_ready = true;
        }

        // handle resizing
        let target_width  = canvas.clientWidth;
        let target_height = canvas.clientHeight;
        if (!system_init || local_width != target_width || local_height != target_height) {
            system_init = true;

            local_width  = target_width;
            local_height = target_height;
            local_ratio  = local_width / local_height;
            
            camera.aspect = local_ratio;
            camera.updateProjectionMatrix();

            color_renderer.setSize(local_width, local_height, false);

            if (settings.bloom.active) {
                bloom_pass = new THREE.UnrealBloomPass(
                    new THREE.Vector2( local_width * settings.bloom.factor, local_height * settings.bloom.factor),
                    settings.bloom.strength,
                    settings.bloom.radius,
                    settings.bloom.threshold,
                );

                composer = new THREE.EffectComposer(color_renderer);
                composer.setPixelRatio(window.devicePixelRatio);
                composer.setSize(local_width, local_height);
                composer.addPass(render_pass);
                if (settings.aa.active)  composer.addPass(aa_pass);
                if (settings.bloom.active) composer.addPass(bloom_pass);
            }
        }

        if (settings.animation.slow.active || settings.animation.fast.active) {
            controls.update();
        }

        let setup_time;
        let node_time;
        let edge_time;

        if (settings.animation.slow.active) {
            setup_time = settings.animation.slow.setup;
            node_time  = settings.animation.slow.node;
            edge_time  = settings.animation.slow.edge;
        } else {
            setup_time = settings.animation.fast.setup;
            node_time  = settings.animation.fast.node;
            edge_time  = settings.animation.fast.edge;
        }

        if (settings.animation.active) {
            // update targets
            if (animation_state == animation_states.update && animation_timer > edge_time) {
                animation_timer -= edge_time;
                animation_state = animation_states.node;

                previous_targets = targets;
                targets          = Array.from(new Set(next_targets));
                next_targets     = [];
                previous_edges   = next_edges;
                next_edges       = {};

                if (targets.length == 0 || targets.length == n_nodes) {
                    animation_state = animation_states.setup;
                }
                else { 
                    animation_state  = animation_states.node;
                    animation_timer += setup_time;
                }
            }

            // set random target
            if (animation_state == animation_states.setup) {
                animation_state = animation_states.node;
                targets = [Math.floor(Math.random() * (n_nodes-1))];
            }

            // set node high
            if (animation_state == animation_states.node && animation_timer > setup_time) {
                animation_timer -= setup_time;
                animation_state = animation_states.edge;

                for (let i = 0; i < targets.length; i++) {
                    node_data_start_times[targets[i]] = t;
                }

                node_texture_start_times.needsUpdate = true;
            }

            // set edges high
            if (animation_state == animation_states.edge && animation_timer > node_time) {
                animation_timer -= node_time;
                animation_state = animation_states.update;
                
                for (let i = 0; i < targets.length; i++) {
                    let iterator = Object.entries(nodes[targets[i]]["connections"]);
                    for (const [node_index_key, edge_result] of iterator) {
                        let node_index = parseInt(node_index_key, 10);
                        let edge_index = edge_result[0];
                        let edge_state = edge_result[1];

                        if (previous_edges[edge_index]) continue;
                        if (settings.animation.culling > 1e-6 && Math.random() <= settings.animation.culling) continue;

                        edge_data_flips[edge_index] = edge_state;
                        edge_data_start_times[edge_index] = t;
                        
                        next_targets = next_targets.concat([node_index]);
                        next_edges[edge_index] = true;
                    }
                }

                edge_texture_start_times.needsUpdate = true;
                edge_texture_flips.needsUpdate       = true;
            }
        }

        node_mesh.material.uniforms.time.value = t;
        edge_mesh.material.uniforms.time.value = t;
   
        color_renderer.clear();
        composer.render(dt);

        requestAnimationFrame(animate);

        t1 = performance.now();
        dt = t1 - t0;
        t0 = t1;

        if (settings.animation.slow.active || settings.animation.fast.active) {
            let max_time;

            if (settings.animation.slow.active) {
                max_time = Math.max(
                    settings.animation.slow.setup,
                    settings.animation.slow.node,
                    settings.animation.slow.edge,
                );
            } else {
                max_time = Math.max(
                    settings.animation.fast.setup,
                    settings.animation.fast.node,
                    settings.animation.fast.edge,
                );
            }

            if(dt > max_time) dt = max_time;

            t += dt;
            animation_timer += dt;
        }
    };

    animate();
}

function backup_main() {
    console.log("[Info] Could not find webgl hints.");

    var gui_interact = document.getElementById("interaction-button");
    gui_interact.style.pointerEvents = "none";
    gui_interact.style.class = "none";
    gui_interact.style.webkitAnimationPlayState = "paused";

    var text = document.getElementById("no-webgl");
    text.style.zIndex = 2;
    text.style.color = "red";
    text.style.fontStyle = "italic";
    text.style.fontSize = "15px";
    text.style.opacity = 1;
}

function can_render() {
    var canvas = document.createElement("canvas");
    if (canvas.getContext("webgl") || canvas.getContext("experimental-webgl") || canvas.getContext("webgl2")) {
        document.getElementById("no-webgl").style.opacity = 0;
        return webgl_main(canvas);
    }
    canvas.remove();
    backup_main();
}


can_render();
