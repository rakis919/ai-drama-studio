from PIL import Image, ImageOps
import sys, json
source, target = sys.argv[1:3]
im = ImageOps.exif_transpose(Image.open(source))
original = im.size
if im.mode in ('RGBA','LA') or (im.mode == 'P' and 'transparency' in im.info):
    rgba=im.convert('RGBA'); bg=Image.new('RGB', rgba.size, 'white'); bg.paste(rgba, mask=rgba.getchannel('A')); im=bg
else:
    im=im.convert('RGB')
im.thumbnail((1536,1536), Image.Resampling.LANCZOS)
im.save(target, 'JPEG', quality=90, optimize=True)
print(json.dumps({'original':original,'upload':im.size}))