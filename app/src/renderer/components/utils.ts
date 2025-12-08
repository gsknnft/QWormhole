


function getSeverityColor(severity: 'low' | 'medium' | 'high'): string {
  switch (severity) {
    case 'high': return '#ff0000';
    case 'medium': return '#ffaa00';
    case 'low': return '#00ff00';
  }
}

function getSeverityTextColor(severity: 'low' | 'medium' | 'high'): string {
  switch (severity) {
    case 'high': return 'text-red-500';
    case 'medium': return 'text-yellow-500';
    case 'low': return 'text-green-500';
  }
}


export {
  getSeverityColor,
  getSeverityTextColor
};