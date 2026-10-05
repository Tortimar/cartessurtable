"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { GameCard, type IngredientLike } from "./ui";
import { playCraftDone, playFactoryDone, playMergeStep } from "@/lib/sound";

export type AssemblyInput = { ing: IngredientLike; kind?: "ingredient" | "product" | "factory"; qty?: number; corner?: ReactNode };

type Props = {
  /** Cartes qui rejoignent le centre, une à une */
  inputs: AssemblyInput[];
  /** Carte qui apparaît à la fin */
  result: ReactNode;
  title: string;
  subtitle?: ReactNode;
  /** Variante « usine » : impacts plus lourds, teinte dorée, son industriel */
  heavy?: boolean;
  onClose: () => void;
  actions?: ReactNode;
};

const START_MS = 650;

/**
 * Animation d'assemblage : les cartes apparaissent en cercle, rejoignent le centre une à une
 * (le noyau grossit à chaque carte), puis flash et apparition de la carte résultat.
 */
export function Assembly({ inputs, result, title, subtitle, heavy, onClose, actions }: Props) {
  const [absorbed, setAbsorbed] = useState(0);
  const [done, setDone] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const step = Math.max(180, Math.min(420, 2600 / Math.max(1, inputs.length)));

  const finish = () => {
    timers.current.forEach(clearTimeout);
    setAbsorbed(inputs.length);
    setDone(true);
    (heavy ? playFactoryDone : playCraftDone)();
  };

  useEffect(() => {
    inputs.forEach((_, i) =>
      timers.current.push(setTimeout(() => { setAbsorbed(i + 1); playMergeStep(i, inputs.length, heavy); }, START_MS + i * step)),
    );
    timers.current.push(setTimeout(finish, START_MS + inputs.length * step + 450));
    const t = timers.current;
    return () => t.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") done ? onClose() : finish(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  // Disposition en cercle autour du centre
  const n = inputs.length;
  const radius = `min(${n > 6 ? 300 : 250}px, 38vw)`;
  const width = n > 8 ? 96 : 120;

  return (
    <div className={`assembly ${heavy ? "heavy" : ""}`} role="dialog" aria-label={title}>
      <div className="assembly-title">
        <h2>{done ? title : heavy ? "Construction en cours…" : "Fabrication en cours…"}</h2>
        {done && subtitle && <p>{subtitle}</p>}
      </div>
      {!done && <button className="btn btn-ghost btn-sm assembly-skip" onClick={finish}>Passer</button>}

      {!done && (
        <>
          <div className="assembly-core" style={{ "--core": 1 + absorbed * (6 / Math.max(1, n)) } as React.CSSProperties} />
          {inputs.map((c, i) => {
            const a = (i / n) * Math.PI * 2 - Math.PI / 2;
            return (
              <div
                key={i}
                className={`assembly-in ${i < absorbed ? "absorbed" : ""}`}
                style={{
                  "--x": `calc(${Math.cos(a).toFixed(3)} * ${radius})`,
                  "--y": `calc(${Math.sin(a).toFixed(3)} * ${radius} * .8)`,
                  "--rot": `${((i % 3) - 1) * 4}deg`,
                  "--w": `${width}px`,
                  "--d": `${i * 50}ms`,
                } as React.CSSProperties}
              >
                <GameCard ing={c.ing} kind={c.kind} qty={c.qty} corner={c.corner} />
              </div>
            );
          })}
        </>
      )}

      {done && (
        <>
          <div className="assembly-rays" />
          <div className="assembly-flash" />
          <div className="assembly-result">{result}</div>
          <div className="assembly-actions">
            {actions}
            <button className="btn btn-primary btn-lg" onClick={onClose}>Continuer</button>
          </div>
        </>
      )}
    </div>
  );
}
