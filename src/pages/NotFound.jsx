import React from "react";
import { useNavigate } from "react-router-dom";
import { Compass, ArrowLeft, Home } from "lucide-react";
import "./NotFound.css";

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="notfound-container">
      <div className="notfound-content">
        <div className="notfound-icon-wrapper">
          <Compass size={64} className="notfound-icon text-primary" />
        </div>
        <h1 className="notfound-title font-serif">404</h1>
        <h2 className="notfound-subtitle">Looks like you got lost.</h2>
        <p className="notfound-description">
          The page you are looking for doesn&apos;t exist or has been moved.
          Let&apos;s get you back on track.
        </p>
        <div className="notfound-actions">
          <button className="btn-secondary flex align-center gap-2" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} /> Go Back
          </button>
          <button className="btn-primary flex align-center gap-2" onClick={() => navigate("/dashboard")}>
            <Home size={16} /> Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;

