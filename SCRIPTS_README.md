# Grand Azura Hotel — Hugo Website Build Scripts

## Script Execution Order

Run these scripts sequentially from the **parent directory** of this project:

| Script | Description |
|--------|-------------|
| `01_init_and_config.sh` | Project init + exhaustive `hugo.toml` |
| `02_css_design_system.sh` | Full CSS design system (variables, typography, layout) |
| `03_base_layouts.sh` | `baseof.html`, SEO partials, Schema.org JSON-LD |
| `04_header_footer.sh` | Header, navigation, mobile menu, footer partials |
| `05_home_page.sh` | Homepage layout + all sections (hero, rooms, about, testimonials) |
| `06_dining_page.sh` | Full categorized dining/menu page |
| `07_rooms_page.sh` | Rooms & Suites listing page |
| `08_contact_page.sh` | Contact page with form and map |
| `09_javascript.sh` | Intersection Observer animations + all Vanilla JS |
| `10_content_and_launch.sh` | Markdown content, static assets, SVG icons, launch instructions |

## Quick Start (after all scripts run)

```bash
cd grand-azura-hotel
hugo server -D --disableFastRender
```

Open: http://localhost:1313
