import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Title, Meta } from '@angular/platform-browser';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { QuizCategory } from '../models/game.models';

export interface SeoConfig {
  title: string;
  description: string;
  keywords?: string;
  ogImage?: string;
  ogType?: string;
  canonicalUrl?: string;
  jsonLd?: object;
}

const BASE_URL = 'https://brainbook.roxsolid.co';
const DEFAULT_IMAGE = `${BASE_URL}/BRAINBOOK.png`;
const DEFAULT_KEYWORDS = 'play to earn, p2e game, trivia, web3 game, earn crypto playing games, celo blockchain, minipay, core dao, nft rewards, brainbook, crypto quiz';

@Injectable({
  providedIn: 'root'
})
export class SeoService {
  private titleService = inject(Title);
  private metaService = inject(Meta);
  private doc = inject(DOCUMENT);
  private router = inject(Router);

  private routeSeoMap: Record<string, SeoConfig> = {
    '/': {
      title: 'BrainBook | Multichain Play-to-Earn Trivia Game',
      description: 'Put your knowledge to the test, earn streaks, daily rewards, climb global leaderboards, and claim unique milestone NFTs on the blockchain with BrainBook!',
      keywords: DEFAULT_KEYWORDS,
      ogImage: DEFAULT_IMAGE,
      canonicalUrl: `${BASE_URL}/`,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'VideoGame',
        'name': 'BrainBook',
        'url': BASE_URL,
        'description': 'Multichain Play-to-Earn trivia game where players test their knowledge, earn crypto rewards, and claim unique milestone NFTs.',
        'genre': ['Trivia', 'Educational', 'Web3', 'Play-to-Earn'],
        'gamePlatform': 'Web Browser',
        'applicationCategory': 'Game',
        'operatingSystem': 'Any',
        'author': {
          '@type': 'Organization',
          'name': 'BrainBook Team',
          'url': BASE_URL
        }
      }
    },
    '/categories': {
      title: 'Trivia Quiz Topics & Categories - Play & Earn Crypto | BrainBook',
      description: 'Browse all trivia categories on BrainBook including Africa, History, Science, Pop Culture, Football, Math, and Movies. Answer questions to earn crypto rewards!',
      keywords: `trivia categories, play to earn topics, quiz categories, ${DEFAULT_KEYWORDS}`,
      ogImage: DEFAULT_IMAGE,
      canonicalUrl: `${BASE_URL}/categories`,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        'name': 'BrainBook Trivia Categories',
        'description': 'Choose from diverse trivia topics to test your skills and earn crypto rewards.',
        'url': `${BASE_URL}/categories`
      }
    },
    '/leaderboard': {
      title: 'Global Trivia Leaderboards & Top Crypto Earners | BrainBook',
      description: 'See the top-ranking players on BrainBook! Compete in trivia challenges, achieve high streaks, climb global rankings, and win monthly crypto rewards.',
      keywords: `crypto leaderboard, trivia rankings, play to earn leaderboard, brainbook top players, ${DEFAULT_KEYWORDS}`,
      ogImage: DEFAULT_IMAGE,
      canonicalUrl: `${BASE_URL}/leaderboard`
    },
    '/how-to-play': {
      title: 'How to Play & Earn Crypto Trivia Guide | BrainBook',
      description: 'Learn how to play BrainBook trivia, earn streak multipliers, use power-ups, claim daily rewards, and withdraw Web3 crypto tokens to your wallet.',
      keywords: `how to play brainbook, earn crypto trivia guide, play to earn tutorial, web3 game guide, ${DEFAULT_KEYWORDS}`,
      ogImage: DEFAULT_IMAGE,
      canonicalUrl: `${BASE_URL}/how-to-play`
    },
    '/token': {
      title: 'BRAIN Token Mechanics & Staking Rewards | BrainBook',
      description: 'Explore BRAIN tokenomics, token utilities, reward distribution, play-to-earn mechanics, and multi-chain blockchain integrations.',
      keywords: `BRAIN token, play to earn tokenomics, crypto quiz token, Web3 token rewards, ${DEFAULT_KEYWORDS}`,
      ogImage: DEFAULT_IMAGE,
      canonicalUrl: `${BASE_URL}/token`
    },
    '/store': {
      title: 'BrainBook Power-Ups & Trivia Store | BrainBook',
      description: 'Unlock 50:50 hints, extra time, streak shields, and game boosts in the BrainBook store using earned coins.',
      keywords: `trivia powerups, game store, quiz hints, brainbook store, ${DEFAULT_KEYWORDS}`,
      ogImage: DEFAULT_IMAGE,
      canonicalUrl: `${BASE_URL}/store`
    },
    '/rewards': {
      title: 'Claim Daily & Milestone Crypto Rewards | BrainBook',
      description: 'Track your total score, milestone achievements, streak rewards, and claim your earned Web3 tokens directly on the blockchain.',
      keywords: `claim crypto rewards, daily quiz rewards, milestone nfts, play to earn payout, ${DEFAULT_KEYWORDS}`,
      ogImage: DEFAULT_IMAGE,
      canonicalUrl: `${BASE_URL}/rewards`
    },
    '/presale': {
      title: 'BRAIN Token Presale & Early Investor Hub | BrainBook',
      description: 'Join the BRAIN token presale! Secure early access to BrainBook tokens and participate in the growth of the premier Web3 Play-to-Earn trivia platform.',
      keywords: `BRAIN token presale, crypto presale, play to earn ICO, early investor quiz token, ${DEFAULT_KEYWORDS}`,
      ogImage: DEFAULT_IMAGE,
      canonicalUrl: `${BASE_URL}/presale`
    },
    '/referrals': {
      title: 'Invite Friends & Earn Referral Crypto Rewards | BrainBook',
      description: 'Share your referral code with friends and earn lifetime bonus crypto rewards whenever they play trivia on BrainBook.',
      keywords: `crypto referral program, invite friends earn crypto, play to earn affiliate, brainbook referrals, ${DEFAULT_KEYWORDS}`,
      ogImage: DEFAULT_IMAGE,
      canonicalUrl: `${BASE_URL}/referrals`
    }
  };

  /** Initialize automatic route listener for default route SEO update */
  initRouteSeo(): void {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      const path = event.urlAfterRedirects.split('?')[0];
      if (this.routeSeoMap[path]) {
        this.setPageSeo(this.routeSeoMap[path]);
      }
    });
  }

  /** Set custom SEO metadata for any specific page */
  setPageSeo(config: SeoConfig): void {
    // 1. Document Title
    this.titleService.setTitle(config.title);

    // 2. Standard Meta Tags
    this.metaService.updateTag({ name: 'title', content: config.title });
    this.metaService.updateTag({ name: 'description', content: config.description });
    this.metaService.updateTag({ name: 'keywords', content: config.keywords || DEFAULT_KEYWORDS });

    // 3. Open Graph Tags
    const url = config.canonicalUrl || `${BASE_URL}${this.router.url.split('?')[0]}`;
    const image = config.ogImage ? (config.ogImage.startsWith('http') ? config.ogImage : `${BASE_URL}/images/${config.ogImage}`) : DEFAULT_IMAGE;

    this.metaService.updateTag({ property: 'og:title', content: config.title });
    this.metaService.updateTag({ property: 'og:description', content: config.description });
    this.metaService.updateTag({ property: 'og:url', content: url });
    this.metaService.updateTag({ property: 'og:image', content: image });
    this.metaService.updateTag({ property: 'og:type', content: config.ogType || 'website' });

    // 4. Twitter Card Tags
    this.metaService.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.metaService.updateTag({ name: 'twitter:title', content: config.title });
    this.metaService.updateTag({ name: 'twitter:description', content: config.description });
    this.metaService.updateTag({ name: 'twitter:image', content: image });
    this.metaService.updateTag({ name: 'twitter:url', content: url });

    // 5. Canonical Link Tag
    this.updateCanonicalUrl(url);

    // 6. JSON-LD Structured Data
    if (config.jsonLd) {
      this.updateJsonLd(config.jsonLd);
    }
  }

  /** Dynamic SEO configuration for Category Play pages (/play/:category) */
  setCategorySeo(cat: QuizCategory): void {
    const title = cat.metaTitle || `${cat.displayName} Trivia Quiz - Play & Earn Crypto | BrainBook`;
    const description = cat.metaDescription || `Test your knowledge in ${cat.displayName} on BrainBook! Answer questions, build streaks, climb the leaderboard, and earn crypto rewards & milestone NFTs.`;
    const keywords = cat.keywords || `${cat.displayName.toLowerCase()} trivia, ${cat.displayName.toLowerCase()} quiz, play to earn crypto, web3 trivia, brainbook, earn crypto quiz`;
    const image = cat.ogImage || cat.icon ? `${BASE_URL}/images/${cat.ogImage || cat.icon}` : DEFAULT_IMAGE;
    const url = `${BASE_URL}/play/${cat.category}`;

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Quiz',
      'name': `${cat.displayName} Trivia Quiz`,
      'description': description,
      'url': url,
      'educationalAlignment': {
        '@type': 'AlignmentObject',
        'educationalFramework': 'General Knowledge',
        'targetName': cat.displayName
      },
      'hasPart': (cat.questions || []).slice(0, 5).map(q => ({
        '@type': 'Question',
        'name': q.text,
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': q.options.find(o => o.isCorrect)?.text || ''
        }
      })),
      'provider': {
        '@type': 'Organization',
        'name': 'BrainBook',
        'url': BASE_URL
      }
    };

    this.setPageSeo({
      title,
      description,
      keywords,
      ogImage: image,
      canonicalUrl: url,
      jsonLd
    });
  }

  private updateCanonicalUrl(url: string): void {
    let link = this.doc.querySelector("link[rel='canonical']");
    if (!link) {
      const newLink = this.doc.createElement('link');
      newLink.setAttribute('rel', 'canonical');
      this.doc.head.appendChild(newLink);
      link = newLink;
    }
    if (link) {
      link.setAttribute('href', url);
    }
  }

  private updateJsonLd(data: object): void {
    let script = this.doc.querySelector('#app-json-ld') as HTMLScriptElement | null;
    if (!script) {
      const newScript = this.doc.createElement('script');
      newScript.id = 'app-json-ld';
      newScript.type = 'application/ld+json';
      this.doc.head.appendChild(newScript);
      script = newScript;
    }
    if (script) {
      script.text = JSON.stringify(data);
    }
  }
}
