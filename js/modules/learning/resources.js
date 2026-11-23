/**
 * Learning resources: free courses, books, data, open-source tools, and publication and
 * patent services, each linked to the design step it supports. Links checked 2026-11-23.
 * External sites belong to their owners; AEROLAB X only links to them.
 */
export const RESOURCE_GROUPS = Object.freeze([
  {
    id: 'courses',
    title: 'Video courses (free to audit)',
    items: [
      { title: 'Aeromechanics of Unmanned Aerial Vehicles / Drones — NPTEL, IIT Kanpur (Prof. Abhishek)', url: 'https://nptel.ac.in/courses/101104807', step: 'Layout, propulsion', note: 'Aerodynamics and flight mechanics of fixed-wing, rotary-wing and VTOL drones.' },
      { title: 'Design of Fixed Wing Unmanned Aerial Vehicles — NPTEL, IIT Kanpur (Prof. Saderla Subrahmanyam)', url: 'https://onlinecourses.nptel.ac.in/noc23_ae12/preview', step: 'Layout & geometry', note: 'Sizing, design parameters and design algorithm for fixed-wing UAVs.' },
      { title: 'UAV Design – Part II — NPTEL, IIT Kanpur', url: 'https://nptel.ac.in/courses/101104083', step: 'Layout, tail sizing', note: 'Tail and control-surface sizing, worked designs for conventional, hand-launched and VTOL fixed wings.' },
      { title: 'Drone modelling, sensor fusion and autopilot design — NPTEL (noc25_ae30)', url: 'https://onlinecourses.nptel.ac.in/noc25_ae30/preview', step: 'Flight dynamics (later builds)', note: '6-DoF modelling in Simulink, Kalman filtering and classical autopilots.' },
      { title: 'Drones for surveying and mapping — NPTEL (noc26_ce12)', url: 'https://onlinecourses.nptel.ac.in/noc26_ce12/preview', step: 'Payload, mission', note: 'Drone types, payloads, GNSS/IMU, flight planning and regulations for survey work.' },
      { title: 'Robotics: Aerial Robotics — Coursera, University of Pennsylvania (Prof. Vijay Kumar)', url: 'https://www.coursera.org/learn/robotics-flight', step: 'Dynamics, control', note: 'Quadrotor dynamics, control and trajectory planning, with MATLAB exercises.' },
      { title: '16.333 Aircraft Stability and Control — MIT OpenCourseWare', url: 'https://ocw.mit.edu/courses/16-333-aircraft-stability-and-control-fall-2004/', step: 'Stability (later builds)', note: 'Static and dynamic stability, autopilots; lecture notes and problem sets.' },
    ],
  },
  {
    id: 'books',
    title: 'Books and notes',
    items: [
      { title: 'R. W. Beard, T. W. McLain — Small Unmanned Aircraft: Theory and Practice (book site and updated draft)', url: 'https://github.com/randybeard/uavbook', step: 'Dynamics, guidance', note: 'Includes a freely downloadable work-in-progress second edition and project files.' },
      { title: 'D. P. Raymer — Aircraft Design: A Conceptual Approach (AIAA)', step: 'Layout, tail volumes, mass', note: 'Standard reference for conceptual sizing; tail volume coefficients (table 6.4).' },
      { title: 'J. D. Anderson — Introduction to Flight (McGraw-Hill)', step: 'Fundamentals', note: 'Atmosphere, aerodynamics and performance from first principles.' },
      { title: 'J. G. Leishman — Principles of Helicopter Aerodynamics (Cambridge)', step: 'Propulsion, hover', note: 'Momentum theory, figure of merit, coaxial rotors.' },
      { title: 'R. Austin — Unmanned Aircraft Systems: UAVS Design, Development and Deployment (Wiley)', step: 'Systems, operations', note: 'Whole-system view including ground control, links and deployment.' },
      { title: 'Q. Quan — Introduction to Multicopter Design and Control (Springer)', step: 'Multirotor design', note: 'Propulsion matching, endurance and control of multicopters.' },
    ],
  },
  {
    id: 'data',
    title: 'Measured data (use as datasheet sources)',
    items: [
      { title: 'UIUC Propeller Data Site (Selig et al.)', url: 'https://m-selig.ae.illinois.edu/props/propDB.html', step: 'Propulsion & energy', note: 'Wind-tunnel C_T and C_P for small UAV propellers. Enter them in Propulsion & Energy and cite the volume.' },
      { title: 'UIUC Airfoil Data Site and low-speed aerofoil tests', url: 'https://m-selig.ae.illinois.edu/ads.html', step: 'Glide-sonde, aerodynamics', note: 'Low-Reynolds-number aerofoil coordinates and test data: essential at stratospheric altitudes.' },
    ],
  },
  {
    id: 'tools',
    title: 'Open-source tools that work with AEROLAB X',
    items: [
      { title: 'OpenVSP — parametric aircraft geometry (NASA)', url: 'https://openvsp.org/', step: '3D review', note: 'Rebuild the layout from the Design Summary dimensions; import the STL export as a reference mesh.' },
      { title: 'XFLR5 — aerofoil, wing and plane analysis at low Reynolds numbers', url: 'http://www.xflr5.tech/xflr5.htm', step: 'Glide-sonde, aerodynamics', note: 'Estimate C_D0, C_Lmax and L/D for the glide and enter them here.' },
      { title: 'FreeCAD — open-source CAD', url: 'https://www.freecad.org/', step: '3D review, build', note: 'Open the STL export to start detailed mechanical design and 3D printing.' },
      { title: 'Blender — 3D modelling and rendering', url: 'https://www.blender.org/', step: '3D review', note: 'Open the glTF export for renders and presentations.' },
      { title: 'ArduPilot — open-source autopilot', url: 'https://ardupilot.org/', step: 'Avionics, flight test', note: 'Firmware and SITL simulator; motor maps and parameters for the flight controller you choose.' },
      { title: 'PX4 Autopilot', url: 'https://px4.io/', step: 'Avionics, flight test', note: 'Alternative open-source autopilot with Gazebo simulation.' },
      { title: 'QGroundControl — ground control station', url: 'https://qgroundcontrol.com/', step: 'Mission planning', note: 'Plan, upload and fly missions for ArduPilot and PX4.' },
      { title: 'Mission Planner (ArduPilot)', url: 'https://ardupilot.org/planner/', step: 'Mission planning', note: 'Windows ground station with log analysis.' },
      { title: 'Gazebo — robot and drone simulator', url: 'https://gazebosim.org/', step: 'Simulation', note: 'Software-in-the-loop testing with ArduPilot or PX4 before real flights.' },
      { title: 'QGIS — open-source GIS', url: 'https://qgis.org/', step: 'Mission, balloon', note: 'Open the KML balloon track and plan recovery areas.' },
    ],
  },
  {
    id: 'balloon',
    title: 'Balloon and sounding services',
    items: [
      { title: 'SondeHub balloon flight predictor (Tawhiri, GFS winds)', url: 'https://predict.sondehub.org/', step: 'Balloon mission', note: 'Used by the Balloon & Glide-Sonde page for the wind-aware ascent; for non-commercial use.' },
      { title: 'Tawhiri predictor API documentation', url: 'https://tawhiri.readthedocs.io/en/latest/api.html', step: 'Balloon mission', note: 'Parameters and response format of the prediction service.' },
    ],
  },
  {
    id: 'defence',
    title: 'Defence research, publication and patents',
    items: [
      { title: 'Defence Science Journal (DRDO / DESIDOC) — open access, no publication fee', url: 'https://publications.drdo.gov.in/ojs/index.php/dsj', step: 'Summary: paper', note: 'Peer-reviewed journal for research with a bearing on defence applications (Web of Science, Scopus indexed).' },
      { title: 'Defence Science Journal — submission requirements', url: 'https://publications.drdo.gov.in/ojs/index.php/dsj/about/submissions', step: 'Summary: paper', note: 'Word manuscript, plagiarism check, signed authorship consent; DRDO authors need lab clearance.' },
      { title: 'InPASS — Indian Patent Advanced Search System (IP India)', url: 'https://iprsearch.ipindia.gov.in/publicsearch', step: 'Summary: patent', note: 'Free full-text search of Indian patent applications and grants: start every prior-art search here.' },
      { title: 'Google Patents', url: 'https://patents.google.com/', step: 'Summary: patent', note: 'Worldwide full-text prior-art search.' },
      { title: 'WIPO PATENTSCOPE', url: 'https://patentscope.wipo.int/', step: 'Summary: patent', note: 'International (PCT) applications and national collections.' },
    ],
  },
]);
