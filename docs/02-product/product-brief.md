# Project 3 Product Decision Brief: HomeOps Guardian (Alexa+ Track)

> **Hackathon**: Amazon "Build, Ship, Shape" Developer Hackathon 2026  
> **Track**: Alexa+ (Primary) | AWS Builder (Mini) | Open Source (Mini)  
> **Entrant**: Atchayam G (Solo Entrant)  
> **Document Date**: 2026-09-03  
> **Status**: Concept Approved for Foundation Phase  

---

## 1. Executive Summary & One-Sentence Pitch

**One-sentence pitch**:  
*A homeowner asks Alexa+ why their electric bill surged or why an appliance sounds strange, and Alexa+ uses Model Context Protocol (MCP) Streamable HTTP tools to run real-time circuit power analytics, inspect appliance duty-cycle telemetry, detect component degradation, and execute rate-aware load-shifting with explicit human confirmation.*

HomeOps Guardian is an agentic household resource and appliance health orchestration server. It connects domestic high-draw energy circuits (HVAC, EV charging, heat pump water heaters, refrigeration) and utility time-of-use (TOU) tariffs directly to Alexa+ via the standard Model Context Protocol over Streamable HTTP (spec version `2025-11-25`).

### Distinctness from Project 1 (NarraTV)
- **NarraTV** (Fire TV track): 10-foot living-room media accessibility. Operates strictly in the media playback space, inserting AI-generated visual scene narration into audio gaps between film dialogue on Fire OS TV devices.
- **HomeOps Guardian** (Alexa+ track): Ambient voice assistant utility and smart-home operations. Operates in the IoT, energy telemetry, and multi-step tool invocation space, turning Alexa+ into an autonomous home diagnostician with formal decision gates. Zero architectural or domain overlap with NarraTV.

---

## 2. Candidate Concepts Evaluated

### Candidate 1: HomeOps Guardian (Smart Home Energy & Appliance Fleet Orchestrator)
**Case**: Modern households operate high-draw electrical appliances across dynamic, multi-tier utility tariffs without actionable visibility into which device is failing or running inefficiently. HomeOps Guardian exposes MCP tools over Streamable HTTP allowing Alexa+ to query high-resolution circuit telemetry, run duty-cycle and vibration Fourier anomaly detection algorithms, calculate monetary impact against current utility pricing tiers, and stage rate-aware mitigation schedules (e.g., pre-cooling thermal mass prior to peak hours, scheduling hot water generation during solar surplus, or flagging failing compressor bearings). Demonstrated entirely in software via a physics-based appliance telemetry engine, an interactive inspector UI, and clean MCP tool endpoints.

### Candidate 2: PantryPilot (Kitchen Inventory, Expiration Tracking & Waste Prevention)
**Case**: Manages household pantry and refrigerated items through conversational inventory logging and receipt OCR. When a user asks Alexa+ what to prepare for dinner, the agent queries perishable shelf-life dates, cross-references dietary goals, synthesizes a zero-waste recipe prioritizing items nearing expiration, and generates an Amazon Fresh cart replenishment list for missing staples.
**Why it is weaker**: Recipe generation and pantry management is among the most congested, clichéd concepts in conversational AI hackathons over the past decade. It exhibits low technical differentiation, relies mostly on trivial CRUD data models, and fails to showcase the distinct power of multi-step agentic tool calling and streaming RPC.

### Candidate 3: RxCare Companion (Ambient Eldercare Medication Reconciliation & Safety Monitor)
**Case**: Designed for older adults living independently and their remote family caregivers. Through daily conversational check-ins via Alexa+, the agent reconciles prescription dosing schedules, verbally logs vital sign readings, detects skipped morning routines, and triggers SMS/webhook escalations to a family care circle if urgent medication is missed.
**Why it is weaker**: Medical, pharmaceutical, and elderly health spaces carry extreme liability, regulatory sensitivity, and high skepticism from judges. In a hackathon without clinical hardware integrations or verified EHR data pipelines, the project would inevitably rely on self-reported mock data, creating an impression of an unsafe or superficial health gadget rather than a production-grade utility.

---

## 3. Official Judging Criteria Evaluation Matrix (25% Each)

| Criterion (Weight) | Candidate 1: HomeOps Guardian | Candidate 2: PantryPilot | Candidate 3: RxCare Companion |
|---|---|---|---|
| **Technical Implementation (25%)** | **High (23/25)**: Full MCP Streamable HTTP transport compliance, session negotiation, multi-parameter telemetry analysis tools, structured JSON-RPC error handling, deterministic safety confirmation gates. | **Low (15/25)**: Simple database CRUD for food items + standard LLM text prompt for recipes. Minimal tool orchestration depth. | **Medium (17/25)**: Reminder timers, basic schedule matching, external SMS webhook integration. Heavy reliance on mock health data. |
| **Design (25%)** | **High (22/25)**: Voice-first multi-turn interaction model designed specifically for Alexa+, paired with an interactive Web Inspector/dashboard for auditability and visual evidence. | **Medium (18/25)**: Standard conversational Q&A; recipe steps can be cumbersome over pure voice without display. | **Medium (18/25)**: Empathic conversational tone, but vulnerable to voice-recognition transcription errors on drug names. |
| **Potential Impact (25%)** | **High (23/25)**: Directly tackles household electricity inflation ($200–$800/yr savings) and prevents catastrophic appliance breakdowns (e.g., HVAC failure in winter). | **Low (14/25)**: Minor convenience in kitchen planning; easily abandoned by users due to inventory entry friction. | **High (22/25)**: Meaningful emotional impact for eldercare, but crippled by medical liability and accuracy risks. |
| **Quality of Idea (25%)** | **High (22/25)**: Highly original application of agentic MCP tools to smart home maintenance and grid-interactive residential energy management. | **Low (12/25)**: Extremely commonplace hackathon trope; identical projects appear in virtually every developer event. | **Medium (17/25)**: Compassionate concept, but standard conversational health assistant pattern. |
| **Total Self-Score (/100)** | **90 / 100** | **59 / 100** | **74 / 100** |

---

## 4. Recommendation: HomeOps Guardian

**Recommendation**: We select **HomeOps Guardian** as the single concept for Project 3. It leverages the full architectural potential of Model Context Protocol Streamable HTTP: stateful session tracking, streaming server-sent events for real-time telemetry inspection, and high-stakes tool execution requiring verifiable reasoning and human confirmation.

### Honest Assessment: What Would Make It Lose Points
To maintain the portfolio's absolute truthfulness standard, we explicitly identify vulnerabilities where judges might deduct points:
1. **Lack of Physical Hardware (Smart Meter / Matter Devices)**: Because the hackathon runs in software from Chennai with no Echo Show or physical smart breaker panel, the telemetry is generated by a realistic software simulation. Judges who prioritize hardware-in-the-loop demonstrations may score Technical Implementation lower unless the telemetry simulator is mathematically rigorous, open-source, and verifiable.
2. **Alexa+ US-Only Geo-Restriction**: As documented in the hackathon rules and `PORTFOLIO-STATE.md`, the Alexa+ developer toolkit is restricted to US AWS accounts. We must present our demo using the official rules fallback ("a simulated Alexa+ experience in a web app") alongside direct MCP Streamable HTTP client calls, which carries less theatrical punch than a physical Echo device speaking live.
3. **Scope Dilution (Breadth vs. Depth)**: If the system attempts to model 20 different household gadgets superficially, it will look like a toy. To score maximum points, we must restrict scope to **three high-draw appliances** (Variable-Speed Heat Pump HVAC, Electric Water Heater, and EV Level 2 Charger) and implement deep, physically accurate electrical telemetry (kW draw, power factor, duty-cycle variance) with real monetary tariff models.
