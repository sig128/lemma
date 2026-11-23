import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RichText, ordinal, roleName } from "@/lib/format";

const html = (t: string) => renderToStaticMarkup(<RichText text={t} />);

describe("format helpers", () => {
  it("renders braced and single-character sub/superscripts", () => {
    expect(html("ord_{s=1} L(E,s)")).toBe("ord<sub>s=1</sub> L(E,s)");
    expect(html("prod c_p / |E_{tors}|^2.")).toBe("prod c<sub>p</sub> / |E<sub>tors</sub>|<sup>2</sup>.");
    expect(html("(s−1)^r = x")).toBe("(s−1)<sup>r</sup> = x");
  });
  it("leaves identifiers alone", () => {
    expect(html("set ANTHROPIC_API_KEY and numerical_threshold")).toBe("set ANTHROPIC_API_KEY and numerical_threshold");
  });
  it("formats ordinals and role names", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 103].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "103rd"]);
    expect(roleName("SKEPTIC")).toBe("Skeptic");
  });
});
