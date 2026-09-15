import { Link } from 'react-router-dom';
import { Grinline } from '../brand/Grinline';
import { DONATION_RATE, money, PRICE } from '../store/catalog';

const PERCENT = Math.round(DONATION_RATE * 100);

export function Mission() {
  return (
    <article className="page">
      <header className="page__head">
        <h1 className="page__title">
          <span className="visually-hidden">The {PERCENT} percent</span>
          <Grinline weight={20} tracking={10} decorative>
            THE 10%
          </Grinline>
        </h1>
        <p className="page__lede">
          Ten percent of every order funds mental health support. It's printed on the cuff next to the logo,
          at the same size as the logo, because a promise you have to go looking for isn't much of a promise.
        </p>
      </header>

      <section className="prose">
        <h2>Off the price, not off the profit</h2>
        <p>
          The {PERCENT}% comes out of what you actually pay — the {money(PRICE.single)} pair price, before
          shipping and tax. That's {money(PRICE.single * DONATION_RATE)} a pair. It is not {PERCENT}% of
          profit, which is a number a company gets to define after it has paid itself, and it is not
          "proceeds", which means whatever the person writing the sentence wants it to mean.
        </p>

        <h2>Every bag shows the number</h2>
        <p>
          The studio shows the donation on the pair you're designing and the bag shows it on the total, before
          you commit to anything. If the number ever gets quietly smaller, you'd see it in the same place.
        </p>

        <h2>Where it goes</h2>
        <p className="prose__placeholder">
          <strong>Not decided yet — and this page won't pretend otherwise.</strong> This is a demo storefront,
          so there is no partner charity, no donation total and no track record to show you. A real version of
          this page would name the organisations, say how they were chosen, and publish what was sent each
          quarter with dated receipts. Anything less specific than that, on any brand's site, is worth a second
          look.
        </p>

        <h2>Socks are not care</h2>
        <p>
          A sock that says Heavy is a way to say something without having to start the conversation. That's
          genuinely useful on a bad day, and it is nowhere near the same thing as support. If today is worse
          than usual, please talk to a person: in the US you can call or text <strong>988</strong>, and
          wherever you are, <strong>findahelpline.com</strong> lists free, confidential lines by country.
        </p>

        <h2>Why the faces look like that</h2>
        <p>
          Twelve starting moods, and most of them aren't happy or sad — they're Fuzzy, Wired, Static, Drained.
          Those are the days people don't have a sock for. Every one of them can be pulled into something else
          in the studio, because a mood you can pick from a list is never quite the one you're having.
        </p>

        <p className="prose__cta">
          <Link className="btn btn--primary btn--big" to="/studio">
            Design a pair
          </Link>
        </p>
      </section>
    </article>
  );
}
