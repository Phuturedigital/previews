import { appStyle } from './with-app-style';
import { appShell } from './with-app-shell';
import { appScript } from './with-app-script';

export const config = { runtime: 'edge' };

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#f5f2ea"><meta name="description" content="Clickable mobile interface prototype for WITH., a South African personal safety network concept."><title>WITH. mobile prototype</title>${appStyle}</head><body>${appShell}${appScript}</body></html>`;

export default function handler(){return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'public, max-age=0, must-revalidate','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin'}})}