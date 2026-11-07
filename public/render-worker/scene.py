"""Blender scene from Skyline's exact revision-bound model faces. No generated geometry."""
import bpy, json, math, pathlib, sys
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:];job=json.loads(pathlib.Path(args[0]).read_text());out=pathlib.Path(args[1])
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=job['width'];scene.render.resolution_y=job['height'];scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.fps=job['fps'];scene.frame_start=1;scene.frame_end=job['frames']
materials={}
def material(color):
    if color not in materials:
        m=bpy.data.materials.new(color);m.use_nodes=True;n=m.node_tree.nodes.get('Principled BSDF');rgb=tuple(int(color[i:i+2],16)/255 for i in (1,3,5));n.inputs['Base Color'].default_value=(*rgb,1);n.inputs['Roughness'].default_value=.65;materials[color]=m
    return materials[color]
# Group by source and colour; each face retains exact project coordinates.
groups={}
for f in job['model']['F']: groups.setdefault((f['sourceId'],f['c']),[]).append(f)
for (source,color),faces in groups.items():
    vertices=[];indices=[]
    for f in faces:
        start=len(vertices);vertices.extend(f['p']);indices.append(tuple(range(start,start+len(f['p']))))
    mesh=bpy.data.meshes.new(source);mesh.from_pydata(vertices,[],indices);mesh.update();obj=bpy.data.objects.new(source,mesh);scene.collection.objects.link(obj);obj.data.materials.append(material(color))
W,D,H=[job['model'][k] for k in ('W','D','H')];target=Vector((W/2,D/2,H/2))
bpy.ops.mesh.primitive_plane_add(size=max(W,D)*15,location=(W/2,D/2,-.3));bpy.context.object.data.materials.append(material('#b1aea4'))
world=bpy.data.worlds.new('Skyline daylight');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.7,.8,1,1);world.node_tree.nodes['Background'].inputs[1].default_value=.5
bpy.ops.object.light_add(type='SUN',location=(W,-D,20));sun=bpy.context.object;sun.data.energy=2;sun.rotation_euler=(.4,-.5,-.4);sun.data.angle=.12
bpy.ops.object.camera_add();camera=bpy.context.object;scene.camera=camera;camera.data.lens=40;camera.data.clip_end=2000
# Camera-attached permanent disclaimer burns into every frame.
bpy.ops.object.text_add();label=bpy.context.object;label.name='Mandatory concept watermark';label.data.body='CONCEPT ONLY - NOT APPROVED\nRevision '+job['revision'][:12];label.data.size=.027;label.data.extrude=0;label.parent=camera;label.location=(-.42,-.245,-1.1);label.rotation_euler=(0,0,0)
m=bpy.data.materials.new('Watermark emission');m.use_nodes=True;nodes=m.node_tree.nodes;nodes.clear();em=nodes.new('ShaderNodeEmission');em.inputs[0].default_value=(1,.86,.59,1);output=nodes.new('ShaderNodeOutputMaterial');m.node_tree.links.new(em.outputs[0],output.inputs[0]);label.data.materials.append(m)
radius=max(W,D)*1.55
for frame in range(1,job['frames']+1):
    a=2*math.pi*(frame-1)/job['frames'];camera.location=(W/2+radius*math.cos(a),D/2+radius*math.sin(a),H+max(W,D)*.65);camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.frame_set(frame);scene.render.filepath=str(out/f'frame_{frame:04d}.png');bpy.ops.render.render(write_still=True)