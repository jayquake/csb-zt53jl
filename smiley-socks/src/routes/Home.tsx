import { Link } from 'react-router-dom';
import { Grinline } from '../brand/Grinline';
import { AnimatedFace, useFaceAnimation } from '../brand/AnimatedFace';
import { Sock } from '../brand/Sock';
import { SockPhoto, sockPhotoAvailable } from '../brand/SockPhoto';
import { templateById, TEMPLATES, type Template } from '../brand/templates';
import { Reel } from '../components/Reel';
import { PackShelf } from '../components/PackShelf';
import { DEFAULT_DESIGN } from '../store/design';
import { COLORWAYS, DONATION_RATE, money, PRICE } from '../store/catalog';

const HERO_ROTATION = ['sunny', 'smitten', 'flirty', 'starstruck', 'crushed', 'fierce', 'proud'];
const COLOUR_ROTATION = ['bone', 'midnight', 'clay', 'butter', 'moss', 'bubblegum'];
const HERO_FACES = HERO_ROTATION.map((id) => templateById(id)).filter(Boolean) as Template[];

export function Home() {
  // The hero sock morphs from one mood into the next rather than cutting
  // between them: the face is a set of numbers, so the in-between frames come
  // free, and the point of the brand is the change rather than any one pose.
  const { face, index } = useFaceAnimation({
    faces: HERO_FACES.map((t) => t.face),
    dwellMs: 2000,
    morphMs: 700,
    blink: true,
    boil: 0.9,
  });

  const template = HERO_FACES[index] ?? HERO_FACES[0];
  const heroColorwayId = COLOUR_ROTATION[index % COLOUR_ROTATION.length];
  const heroDesign = {
    ...DEFAULT_DESIGN,
    face,
    colorwayId: heroColorwayId,
    placementId: 'cuff',
  };
  const heroInk = COLORWAYS.find((c) => c.id === heroColorwayId)?.ink ?? '#191710';

  return (
    <>
      <section className="hero">
        <div className="hero__copy">
          <h1 className="hero__title">
            <span className="visually-hidden">Wear how you feel</span>
            <Grinline weight={19} tracking={10} decorative>
              WEAR HOW
            </Grinline>
            <Grinline weight={19} tracking={10} decorative>
              YOU FEEL
            </Grinline>
          </h1>
          <p className="hero__lede">
            Socks with a face that says where you're actually at. Start from a mood, then pull the face around
            with your thumb until it's yours. {Math.round(DONATION_RATE * 100)}% of every order funds mental
            health support.
          </p>
          <div className="hero__actions">
            <Link className="btn btn--primary btn--big" to="/studio">
              Design your pair
            </Link>
            <Link className="btn btn--ghost btn--big" to="/10-percent">
              Where the {Math.round(DONATION_RATE * 100)}% goes
            </Link>
          </div>
          <p className="hero__meta">
            {money(PRICE.single)} a pair · {money(PRICE.three)} each for three · {money(PRICE.six)} each for six
          </p>
        </div>

        <div className="hero__art">
          {sockPhotoAvailable(heroColorwayId) ? (
            <SockPhoto
              colorwayId={heroColorwayId}
              face={face}
              ink={heroInk}
              finish={heroDesign.finish}
              className="hero__sock"
            />
          ) : (
            <Sock design={heroDesign} className="hero__sock" />
          )}
          <p className="hero__caption">{template.name} — {template.blurb}</p>
        </div>
      </section>

      <section className="band">
        <div className="band__inner">
          <p className="band__big">
            The face is the product. The logo is a {'≈'}29 mm cuff hit — small, where Stance puts theirs —
            and the {Math.round(DONATION_RATE * 100)}% is printed right next to it, because it should be as
            hard to ignore as the brand.
          </p>
        </div>
      </section>

      <section className="steps">
        <h2 className="section__title">Three minutes, start to bag</h2>
        <ol className="steps__list">
          <li className="step">
            <span className="step__n">1</span>
            <h3>Pick a mood that's close</h3>
            <p>Twelve starting faces, and not one of them is "fine". Fuzzy and Wired are on the shelf too.</p>
          </li>
          <li className="step">
            <span className="step__n">2</span>
            <h3>Pull it until it's right</h3>
            <p>
              Grab the eyes, the brows, the corners of the mouth. Drag the chin down. Keep pulling past a
              frown and the mouth opens. It's your face, so it should take some pulling.
            </p>
          </li>
          <li className="step">
            <span className="step__n">3</span>
            <h3>Put it on a sock</h3>
            <p>Six colourways, three heights, four placements. Or drop in your own image instead.</p>
          </li>
        </ol>
      </section>

      <PackShelf />

      <Reel />

      <section className="gallery">
        <h2 className="section__title">Start from one of these</h2>
        <p className="section__lede">Tap any face to open it in the studio.</p>
        <ul className="gallery__grid">
          {TEMPLATES.map((t, i) => (
            <li key={t.id}>
              <Link className="moodcard" to={`/studio?start=${t.id}`}>
                <AnimatedFace
                  spec={{ faces: [t.face], blink: true, boil: 0.8, phaseMs: i * 640, seed: i + 1 }}
                  className="moodcard__face"
                  title={t.name}
                />
                <span className="moodcard__name">{t.name}</span>
                <span className="moodcard__blurb">{t.blurb}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="faq">
        <h2 className="section__title">Questions people actually ask</h2>
        <div className="faq__list">
          <details>
            <summary>Is the {Math.round(DONATION_RATE * 100)}% off profit or off the price?</summary>
            <p>
              Off the price. Ten percent of what you pay, before shipping and tax — not ten percent of whatever
              is left at the end of the year.
            </p>
          </details>
          <details>
            <summary>How big is the face on the sock?</summary>
            <p>
              The default cuff hit is about 29 mm across, sitting just under the cuff on the outside of the leg
              — the same placement and roughly the same footprint as a Stance logo. The big leg hit is about
              49 mm. The studio preview is drawn to scale, so what you see is the size you get.
            </p>
          </details>
          <details>
            <summary>Can I put my own picture on them?</summary>
            <p>
              Yes — the Photo tab in the studio. It's resized in your browser and never leaves your device in
              this demo.
            </p>
          </details>
          <details>
            <summary>Is this a real shop?</summary>
            <p>
              Not yet. This is a working demo: you can design, save and fill a bag, but no payment is taken and
              nothing ships.
            </p>
          </details>
        </div>
      </section>
    </>
  );
}
