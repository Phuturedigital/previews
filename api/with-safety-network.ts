import { renderPage } from './with-site-shell';
import { homePage } from './with-page-home';
import { missionPage } from './with-page-mission';
import { howPage } from './with-page-how';
import { assistancePage } from './with-page-assistance';
import { organisationsPage } from './with-page-organisations';
import { trustPage } from './with-page-trust';
import { joinPage } from './with-page-join';

export const config = { runtime: 'edge' };

const pages: Record<string,{title:string;description:string;body:string;active:string}> = {
  home: { title: 'Safety should start before the emergency', description: 'WITH. is a South African personal safety network concept connecting people, devices, businesses and responders into one protection loop.', body: homePage, active: 'home' },
  mission: { title: 'Mission', description: 'Why WITH. is being built and the mission behind connected personal safety infrastructure in South Africa.', body: missionPage, active: 'mission' },
  'how-it-works': { title: 'How it works', description: 'Explore the WITH. protection loop, Guardian, Private Risk and the fault tolerant incident model.', body: howPage, active: 'how' },
  'assistance-points': { title: 'Assistance Points', description: 'How real businesses and institutions could become verified places where people can reach practical help.', body: assistancePage, active: 'assistance' },
  organisations: { title: 'For organisations', description: 'How employers, campuses, banks, insurers, property groups and response providers can help fund and strengthen WITH.', body: organisationsPage, active: 'organisations' },
  trust: { title: 'Trust Centre', description: 'WITH. privacy, AI, anti surveillance and information sharing principles.', body: trustPage, active: 'trust' },
  join: { title: 'Join early', description: 'Join the WITH. research list as an individual, business, organisation, responder or community partner.', body: joinPage, active: 'join' },
};

export default function handler(req: Request) {
  const url = new URL(req.url);
  const requested = (url.searchParams.get('page') || 'home').replace(/^\/+|\/+$/g,'');
  const page = pages[requested] || pages.home;
  return new Response(renderPage(page), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, must-revalidate', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' } });
}
