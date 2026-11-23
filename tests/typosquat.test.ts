import { describe, expect, it } from "vitest";
import { damerauLevenshtein, findTyposquat } from "@/deps/typosquat";

const popular = ["lodash", "express", "react", "@babel/core", "requests", "numpy", "axios", "vue"];

describe("typosquat matcher", () => {
  it("computes DL distance incl. transposition", () => {
    expect(damerauLevenshtein("lodash", "lodahs")).toBe(1);
    expect(damerauLevenshtein("abc", "abc")).toBe(0);
    expect(damerauLevenshtein("kitten", "sitting")).toBe(3);
  });
  it("flags names within distance 2", () => {
    expect(findTyposquat("lodahs", popular)).toEqual({ target: "lodash", distance: 1 });
    expect(findTyposquat("expresss", popular)?.target).toBe("express");
    expect(findTyposquat("reqeusts", popular)?.target).toBe("requests");
    expect(findTyposquat("numpyyy", popular)?.distance).toBe(2);
  });
  it("does not flag distance 3", () => {
    expect(findTyposquat("numpyyyy", popular)).toBeNull();
  });
  it("does not flag names already in the list", () => {
    expect(findTyposquat("lodash", popular)).toBeNull();
    expect(findTyposquat("LODASH", popular)).toBeNull();
  });
  it("skips names shorter than 4", () => {
    expect(findTyposquat("vue", popular)).toBeNull();
    expect(findTyposquat("vuo", popular)).toBeNull();
    expect(findTyposquat("axio", popular)?.target).toBe("axios"); // length 4 is checked
  });
  it("compares scoped names on the full name", () => {
    expect(findTyposquat("@babel/cor", popular)?.target).toBe("@babel/core");
    expect(findTyposquat("@evil/core", popular)).toBeNull();
  });
});
