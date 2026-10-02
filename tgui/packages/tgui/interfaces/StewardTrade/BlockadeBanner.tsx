export const BlockadeBanner = ({ regions }: { regions: string[] }) =>
  !regions?.length ? null : (
    <p className="StewardDesk__notice StewardDesk__notice--danger">
      <strong>Blockaded Regions:</strong> {regions.join(', ')}
    </p>
  );
