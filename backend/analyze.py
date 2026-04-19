import sys
import json
from pathlib import Path

# Add app to path
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv

load_dotenv()


def main():
    args = sys.argv[1:]
    if not args:
        print("Usage: python analyze.py [--single] <path_to_nda.md>")
        sys.exit(1)

    single = False
    positional = []
    for a in args:
        if a == "--single":
            single = True
        elif a in ("-h", "--help"):
            print("Usage: python analyze.py [--single] <path_to_nda.md>")
            print("  --single   Use the single General Counsel agent instead of the full crew")
            sys.exit(0)
        else:
            positional.append(a)

    if not positional:
        print("Usage: python analyze.py [--single] <path_to_nda.md>")
        sys.exit(1)

    nda_path = Path(positional[0])
    if not nda_path.exists():
        print(f"File not found: {nda_path}")
        sys.exit(1)

    nda_text = nda_path.read_text()
    print(f"Analyzing NDA: {nda_path.name} ({len(nda_text)} chars)")

    if single:
        print("Running General Counsel analysis (single-agent mode)...")
        from app.agents.general_counsel import analyze_nda_single_agent

        result = analyze_nda_single_agent(nda_text)
    else:
        print("Running multi-agent crew analysis (GC + Corporate + IP + Compliance)...")
        from app.agents.crew import analyze_nda_multi_agent

        result = analyze_nda_multi_agent(nda_text)

    print("\n" + "=" * 60)
    print("ANALYSIS COMPLETE")
    print("=" * 60)
    print(json.dumps(result.model_dump(), indent=2))

    print(
        f"\nFlag counts: {result.red_flags} red, "
        f"{result.yellow_flags} yellow, {result.green_flags} green"
    )


if __name__ == "__main__":
    main()
