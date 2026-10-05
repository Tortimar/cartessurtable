import "./load-env";
import { recomputeRarities } from "./rarity";

recomputeRarities().then((s) => console.log("Raretés recalculées :", s));
