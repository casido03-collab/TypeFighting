import { styles } from "../styles/styles";

export function Background() {
  return (
    <div style={styles.background} aria-hidden="true">
      <div style={styles.sun} />
      <div style={{ ...styles.cloud, ...styles.cloudOne }} />
      <div style={{ ...styles.cloud, ...styles.cloudTwo }} />
      <div style={{ ...styles.mountain, ...styles.mountainOne }} />
      <div style={{ ...styles.mountain, ...styles.mountainTwo }} />
      <div style={styles.grass} />
      <div style={styles.grassShadow} />
    </div>
  );
}
