import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import * as pmtiles from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import "./GeoPortalView.css";

export default function GeoPortalView() {
  const [page, setPage] = useState("landing"); // landing | loading | portal
  const [transition, setTransition] = useState(""); // '' | 'fade-out' | 'fade-in'
  const [loadingStep, setLoadingStep] = useState(0);

  const handleEnter = () => {
    setTransition("fade-out");
    setTimeout(() => {
      setPage("loading");
      setTransition("fade-in");
      setLoadingStep(1);
      const steps = 3;
      const interval = 500;
      let currentStep = 1;
      const intervalId = setInterval(() => {
        currentStep++;
        setLoadingStep(currentStep);
        if (currentStep >= steps) {
          clearInterval(intervalId);
          setTimeout(
            () => {
              setTransition("fade-out");
              setTimeout(() => {
                setPage("portal");
                setTransition("fade-in");
                setTimeout(() => setTransition(""), 400);
              }, 400);
            },
            3000 - interval * (steps - 1),
          );
        }
      }, interval);
      setTimeout(() => setTransition(""), 400);
    }, 400);
  };

  return (
    <div className={`geo-portal-container ${transition}`}>
      {page === "landing" && (
        <div className="geo-portal-landing">
          <h1 className="geo-portal-title">geo-portal.log</h1>
          <div className="geo-portal-desc-text">
            establishing world connection...
            <br />
            loading pixel map interface...
            <br />
            memory allocation: sufficient
            <br />
            press <span className="geo-portal-desc-enter">[enter]</span> to
            proceed
          </div>
          <div className="geo-portal-globe-placeholder">
            <img
              src="/public/earthspin.gif"
              alt="Pixel Earth Globe"
              className="geo-portal-globe-img"
            />
          </div>
          <span
            className="geo-portal-enter-btn"
            role="button"
            tabIndex={0}
            onClick={handleEnter}
            onKeyPress={(e) => {
              if (e.key === "Enter" || e.key === " ") handleEnter();
            }}
          >
            [enter]
          </span>
        </div>
      )}
      {page === "loading" && (
        <div className="geo-portal-loading-page">
          <div className="geo-portal-loading-bios-text">
            {loadingStep > 0 && (
              <>
                initializing geo-portal subsystem...
                <br />
              </>
            )}
            {loadingStep > 1 && (
              <>
                scan complete.
                <br />
              </>
            )}
            {loadingStep > 2 && (
              <span className="geo-portal-loading-blink">loading</span>
            )}
          </div>
        </div>
      )}
      {page === "portal" && (
        <div className="geo-portal-map-page">
          <div className="geo-portal-map-box">
            <div className="geo-portal-map-main">
              <MapPortal />
            </div>
            <div className="geo-portal-map-side">
              {/* Side panel content goes here */}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Move MapPortal and MapEvents to top-level, and use hooks from import

function MapPortal() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    // Setup PMTiles protocol
    let protocol = new pmtiles.Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);

    // Only initialize map once
    if (mapRef.current) return;

    mapRef.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          cartoon: {
            type: "raster",
            url: "pmtiles:///map_tiles/maptiles.pmtiles",
          },
        },
        layers: [
          {
            id: "cartoon",
            type: "raster",
            source: "cartoon",
          },
        ],
      },
      center: [0, 0],
      zoom: 3,
      minZoom: 3,
      maxZoom: 10,
    });

    // Add navigation controls
    mapRef.current.addControl(new maplibregl.NavigationControl(), "top-left");

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={mapContainer}
      style={{
        width: "100%",
        height: "100%",
        position: "absolute",
        top: 0,
        left: 0,
      }}
    />
  );
}
