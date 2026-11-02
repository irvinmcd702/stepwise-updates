<?php
// Lab mailbox: every email the site sends is written to /logs/mail.log instead of going out.
add_filter( 'pre_wp_mail', function ( $null, $atts ) {
	$line = gmdate( 'c' ) . "\t" . ( is_array( $atts['to'] ) ? implode( ',', $atts['to'] ) : $atts['to'] ) . "\t" . $atts['subject'] . "\n";
	file_put_contents( '/logs/mail.log', $line, FILE_APPEND );
	return true;
}, 10, 2 );
