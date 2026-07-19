import sharp from 'sharp';

const normalized = await sharp({
  create: {
    width: 2,
    height: 2,
    channels: 3,
    background: '#637a45',
  },
})
  .webp()
  .toBuffer();

const metadata = await sharp(normalized).metadata();
if (metadata.format !== 'webp' || metadata.width !== 2 || metadata.height !== 2) {
  throw new Error('The container Sharp/libvips runtime did not normalize the verification image.');
}

console.log(`Sharp ${sharp.versions.sharp} with libvips ${sharp.versions.vips} is ready.`);
