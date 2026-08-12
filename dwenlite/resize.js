import { Jimp } from 'jimp';

async function resizeImages() {
  try {
    const image = await Jimp.read('public/react.png');
    
    // Resize to 192x192
    const img192 = image.clone();
    img192.resize({ w: 192, h: 192 });
    await img192.write('public/pwa-192x192.png');
    console.log('Created pwa-192x192.png');

    // Resize to 512x512
    const img512 = image.clone();
    img512.resize({ w: 512, h: 512 });
    await img512.write('public/pwa-512x512.png');
    console.log('Created pwa-512x512.png');

    // Resize to 512x512 maskable (we can just add padding if needed, but lets just use the same for now)
    const img512maskable = image.clone();
    img512maskable.resize({ w: 512, h: 512 });
    await img512maskable.write('public/pwa-512x512-maskable.png');
    console.log('Created pwa-512x512-maskable.png');
  } catch (error) {
    console.error('Error resizing images:', error);
  }
}

resizeImages();
