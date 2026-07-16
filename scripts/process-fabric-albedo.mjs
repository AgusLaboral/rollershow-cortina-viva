import sharp from 'sharp';

await sharp('img/fabric/blackout.jpg')
  .linear(0.08, 232)
  .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
  .toFile('img/fabric/blackout-albedo.jpg');

await sharp('img/fabric/tusor.jpg')
  .linear(0.55, 112)
  .modulate({ saturation: 0.72 })
  .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
  .toFile('img/fabric/tusor-albedo.jpg');

console.log('albedos textiles calibrados');
