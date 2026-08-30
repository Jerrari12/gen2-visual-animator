
import bpy, os, sys
from mathutils import Matrix

SHARE = r"D:\Claude - Model Sharing\GEN2"
dst = sys.argv[sys.argv.index("--")+1]
FOLDER = {59:'Case Extenders',115:'Case Extenders',165:'Case Extenders',
          185:'Case Extenders',240:'Case Extender',270:'Case Extenders'}
def fname(L,w):
    return f'{L}-{w}W Case Extender.stl' if L==270 else f'{L}-{w}W-1H Case Extender.stl'

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.unit_settings.system = 'METRIC'
sc.unit_settings.scale_length = 0.001
report = []

for i, L in enumerate((59,115,165,185,240,270)):
    col = bpy.data.collections.new(f'CaseExtenders_{L}')
    sc.collection.children.link(col)
    for w in (1,2,3,4):
        stl = os.path.join(SHARE, str(L), FOLDER[L], 'No Helper Disks', fname(L,w))
        before = set(bpy.data.objects)
        bpy.ops.wm.stl_import(filepath=stl)
        ob = [o for o in bpy.data.objects if o not in before][0]
        me = ob.data
        # native STL orientation IS the installed orientation (Joey's reference
        # object sits at rotation 0) -- centre X/Y, drop bottom to Z=0, no flip
        xs=[v.co.x for v in me.vertices]; ys=[v.co.y for v in me.vertices]; zs=[v.co.z for v in me.vertices]
        me.transform(Matrix.Translation((-(min(xs)+max(xs))/2, -(min(ys)+max(ys))/2, -min(zs))))
        me.update()
        name = f'{L}-{w}W-1H Case Extender'          # normalised (270 STLs omit -1H)
        ob.name = name; me.name = name
        ob.matrix_world = Matrix.Identity(4)
        ob.location = (w*450.0, i*350.0, 0)
        ob.hide_viewport = False; ob.hide_render = False; ob.hide_select = False
        me.materials.clear()
        for c in ob.users_collection: c.objects.unlink(ob)
        col.objects.link(ob)
        tris = sum(len(p.vertices)-2 for p in me.polygons)
        report.append((name, [round(v,1) for v in ob.dimensions], tris))

bpy.ops.wm.save_as_mainfile(filepath=dst, compress=True)
print("[build] objects:", len(sc.objects))
for r in report: print("[build]", r)
